from abc import ABC, abstractmethod
from config import LLMConfig, EmailConfig, CommonConfig
from llm.GPT import GPT
from llm.Ollama import Ollama
from email_utils.base_template import framework, get_stars, get_summary_html, render_summary_sections, get_empty_html
from tqdm import tqdm
import json
import os
import argparse
from datetime import datetime, timezone
import time
import smtplib
from email.header import Header
from email.mime.text import MIMEText
from email.utils import parseaddr, formataddr
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading


class BaseSource(ABC):
    name: str = ""
    default_title: str = "Daily Recommender"
    managed_sender_address: str = "boming8036881@163.com"

    def __init__(self, source_args: dict, llm_config: LLMConfig, common_config: CommonConfig):
        self.llm_config = llm_config
        self.common_config = common_config
        self.source_args = source_args
        self.num_workers = common_config.num_workers
        self.temperature = llm_config.temperature
        self.run_datetime = datetime.now(timezone.utc)
        self.run_date = self.run_datetime.strftime("%Y-%m-%d")
        self.description = common_config.description
        self.log_level = (common_config.log_level or "standard").lower()
        self.profile_hash = common_config.profile_hash
        self.lock = threading.Lock()

        base_dir = os.path.dirname(os.path.abspath(__file__))

        # --- Cache layer 1: shared fetch cache (interest-independent) ---
        self.fetch_cache_dir = os.path.join(
            base_dir, common_config.state_dir, "fetch_cache", self.name, self.run_date
        )
        os.makedirs(self.fetch_cache_dir, exist_ok=True)

        # --- Cache layer 2: eval cache (isolated by profile_hash) ---
        self.eval_cache_dir = None
        if self.profile_hash:
            self.eval_cache_dir = os.path.join(
                base_dir, common_config.state_dir, "eval_cache",
                self.name, self.run_date, self.profile_hash,
            )
            os.makedirs(self.eval_cache_dir, exist_ok=True)

        # --- History: final output mirror (unchanged structure for UI) ---
        self.save_dir = None
        self.cache_dir = None  # legacy alias kept for compatibility
        if common_config.save:
            self.save_dir = os.path.join(base_dir, common_config.save_dir, self.name, self.run_date)
            self.cache_dir = os.path.join(self.save_dir, "json")
            os.makedirs(self.cache_dir, exist_ok=True)

        provider = llm_config.provider.lower()
        if provider == "ollama":
            self.model = Ollama(llm_config.model)
        elif provider in ("openai", "siliconflow"):
            self.model = GPT(llm_config.model, llm_config.base_url, llm_config.api_key)
        else:
            raise ValueError(f"Unsupported LLM provider: {provider}")
        print(f"[{self.name}] Model initialized: {llm_config.model} via {provider}")
        self._log("verbose", f"[{self.name}] Using interest profile: {self._truncate_for_log(self.description, 320)}")

    @staticmethod
    @abstractmethod
    def add_arguments(parser: argparse.ArgumentParser):
        """Register source-specific CLI arguments (with prefix)."""
        pass

    @abstractmethod
    def fetch_items(self) -> list[dict]:
        """Fetch raw items from the data source."""
        pass

    @abstractmethod
    def build_eval_prompt(self, item: dict) -> str:
        """Build LLM evaluation prompt for a single item."""
        pass

    @abstractmethod
    def parse_eval_response(self, item: dict, response: str) -> dict:
        """Parse LLM response into a structured result dict. Must include 'score' key."""
        pass

    @abstractmethod
    def render_item_html(self, item: dict) -> str:
        """Render a single recommendation item as HTML."""
        pass

    @abstractmethod
    def build_summary_overview(self, recommendations: list[dict]) -> str:
        """Build a text overview of recommendations for the summary LLM prompt."""
        pass

    @abstractmethod
    def get_summary_prompt_template(self) -> str:
        """Return the HTML template instruction for the summary LLM prompt."""
        pass

    @abstractmethod
    def get_section_header(self) -> str:
        """Return the section header HTML (e.g. '<div class="section-title">...')."""
        pass

    @abstractmethod
    def get_item_cache_id(self, item: dict) -> str:
        """Return a unique cache filename (without extension) for an item."""
        pass

    def get_max_items(self) -> int:
        """Return the max number of items to recommend. Override in subclass."""
        return 30

    def _should_log(self, level: str) -> bool:
        order = {"progress": 0, "standard": 1, "verbose": 2}
        current = order.get(self.log_level, 1)
        target = order.get(level, 1)
        return current >= target

    def _log(self, level: str, message: str) -> None:
        if self._should_log(level):
            print(message)

    @staticmethod
    def _truncate_for_log(value: str, limit: int = 220) -> str:
        clean = " ".join(str(value or "").split())
        if len(clean) <= limit:
            return clean
        return clean[: limit - 3] + "..."

    def _item_log_title(self, item: dict) -> str:
        for key in ("title", "repo_name", "model_id", "name", "arxiv_id", "id"):
            value = item.get(key)
            if value:
                return str(value)
        text = item.get("text")
        if text:
            return self._truncate_for_log(str(text), 80)
        return "unknown-item"

    def _item_log_preview(self, item: dict) -> str:
        for key in ("abstract", "description", "summary", "text", "repo_description"):
            value = item.get(key)
            if value:
                return self._truncate_for_log(str(value), 260)
        return ""

    def _load_fetch_cache(self, key: str) -> list[dict] | None:
        """Load shared fetch cache (interest-independent)."""
        from cache_utils import safe_read_json
        path = os.path.join(self.fetch_cache_dir, f"{key}.json")
        data = safe_read_json(path)
        if data is not None and isinstance(data, list):
            print(f"[{self.name}] Fetch cache hit: {key} ({len(data)} items)")
        return data if isinstance(data, list) else None

    def _save_fetch_cache(self, key: str, items: list[dict]):
        """Save shared fetch cache (interest-independent)."""
        from cache_utils import atomic_write_json
        path = os.path.join(self.fetch_cache_dir, f"{key}.json")
        try:
            atomic_write_json(path, items)
        except OSError as e:
            print(f"[{self.name}] Fetch cache write failed: {e}")

    def process_item(self, item: dict, max_retries: int = 5) -> dict | None:
        from cache_utils import atomic_write_json, safe_read_json

        retry_count = 0
        cache_id = self.get_item_cache_id(item)

        # Primary: profile-isolated eval cache (state/eval_cache/<source>/<date>/<profile_hash>/)
        eval_path = os.path.join(self.eval_cache_dir, f"{cache_id}.json") if self.eval_cache_dir else None

        if eval_path:
            cached = safe_read_json(eval_path)
            if cached is not None:
                print(f"[{self.name}] Eval cache hit: {cache_id}")
                # Mirror to history for UI
                self._mirror_to_history(cache_id, cached)
                return cached

        while retry_count < max_retries:
            try:
                self._log("verbose", f"[{self.name}] Reading item: {self._item_log_title(item)}")
                preview = self._item_log_preview(item)
                if preview:
                    self._log("verbose", f"[{self.name}] Item text: {preview}")
                prompt = self.build_eval_prompt(item)
                response = self.model.inference(prompt, temperature=self.temperature)
                result = self.parse_eval_response(item, response)

                # Write to eval cache (profile-isolated, atomic)
                if eval_path:
                    try:
                        atomic_write_json(eval_path, result)
                    except OSError as e:
                        print(f"[{self.name}] Eval cache write failed ({eval_path}): {e}")

                # Mirror to history for UI
                self._mirror_to_history(cache_id, result)
                return result

            except Exception as e:
                retry_count += 1
                print(f"[{self.name}] Error processing item {cache_id}: {e}")
                print(f"Retry {retry_count}/{max_retries}...")
                if retry_count == max_retries:
                    print(f"Max retries reached, skipping {cache_id}")
                    return None
                time.sleep(1)
        return None

    def _mirror_to_history(self, cache_id: str, result: dict):
        """Write eval result to history/json/ for UI compatibility."""
        if not self.cache_dir:
            return
        history_path = os.path.join(self.cache_dir, f"{cache_id}.json")
        try:
            with self.lock:
                with open(history_path, "w", encoding="utf-8") as f:
                    json.dump(result, f, ensure_ascii=False, indent=2)
        except OSError:
            pass

    def get_recommendations(self) -> list[dict]:
        raw_items = self.fetch_items()
        if not raw_items:
            print(f"[{self.name}] No items fetched.")
            return []

        recommendations = []
        print(f"[{self.name}] Processing {len(raw_items)} items with LLM...")

        with ThreadPoolExecutor(self.num_workers) as executor:
            futures = [executor.submit(self.process_item, item) for item in raw_items]
            for future in tqdm(as_completed(futures), total=len(futures),
                               desc=f"[{self.name}] Processing", unit="item"):
                result = future.result()
                if result:
                    recommendations.append(result)

        recommendations = sorted(
            recommendations, key=lambda x: x.get("score", 0), reverse=True
        )[:self.get_max_items()]

        if self.save_dir:
            self._save_markdown(recommendations)

        return recommendations

    def _save_markdown(self, recommendations: list[dict]):
        save_path = os.path.join(self.save_dir, f"{self.run_date}.md")
        with open(save_path, "w", encoding="utf-8") as f:
            f.write(f"# {self.default_title} Recommendations\n")
            f.write(f"## Date: {self.run_date}\n\n")
            for i, r in enumerate(recommendations):
                f.write(f"### {i + 1}. {r.get('title', 'Unknown')}\n")
                f.write(f"- **Score:** {r.get('score', 0)}\n")
                f.write(f"- **Summary:** {r.get('summary', 'N/A')}\n")
                f.write(f"- **URL:** {r.get('url', '')}\n\n")

    def _parse_interest_fields(self) -> list[str]:
        """Parse interest field names from description text."""
        fields = []
        for line in self.description.splitlines():
            line = line.strip()
            # Match lines like "1. Agent - ..." or "2. Safety"
            if line and line[0].isdigit() and '. ' in line:
                field = line.split('. ', 1)[1].split(' - ')[0].strip()
                if field:
                    fields.append(field)
            if line.lower().startswith("i'm not interested") or line.lower().startswith("i am not interested"):
                break
        return fields

    def summarize(self, recommendations: list[dict]) -> str:
        overview = self.build_summary_overview(recommendations)
        fields = self._parse_interest_fields()
        self._log("verbose", f"[{self.name}] Summary input: {self._truncate_for_log(overview, 400)}")

        prompt_context = """
            你是一个有帮助的助手，帮助我追踪热门内容。
            以下是我感兴趣的领域描述：
            {}
        """.format(self.description)
        content_context = """
            以下是今天的热门内容摘要：
            {}
        """.format(overview)

        if fields and len(fields) >= 2:
            fields_sections = "\n".join([
                f"""              <div class="summary-section">
                <h2>{f} 方向</h2>
                <ol class="summary-list">
                  <li class="summary-item">
                    <div class="summary-item__header"><span class="summary-item__title">标题/名称</span><span class="summary-pill">类型</span></div>
                    <p class="summary-item__stats">⭐ XXX stars (+YYY today) 或 👍 ZZ upvotes 或 ❤️ NN likes</p>
                    <p><strong>推荐理由：</strong>...</p>
                    <p><strong>关键亮点：</strong>...</p>
                  </li>
                </ol>
                <p><em>如果今天没有与此方向相关的内容，请写"今日暂无相关内容"。</em></p>
              </div>""" for f in fields
            ])
            template = f"""
            请直接输出一段 HTML 片段，严格遵循以下结构，不要包含 JSON、Markdown 或多余说明。
            重要：请按我的 {len(fields)} 个兴趣方向（{', '.join(fields)}）分别总结，每个方向一个独立的 section，
            列出该方向下最相关的 2-4 项内容。

            <div class="summary-wrapper">
              <div class="summary-section">
                <h2>今日总览</h2>
                <p>简要概括今天各方向的整体动态（2-3句话）...</p>
              </div>
{fields_sections}
              <div class="summary-section">
                <h2>补充观察</h2>
                <p>跨方向的共同趋势或其他值得关注的内容...</p>
              </div>
            </div>

            用中文撰写内容。每个方向 section 中的推荐项请包含推荐理由和关键亮点。
            重要：每个推荐项必须包含真实的互动数据（如 GitHub 项目的 stars/today stars、论文的 upvotes、模型的 likes/downloads、推文的点赞/转发），从上面的摘要中提取，放在 <p class="summary-item__stats"> 标签中。禁止省略此数据行。
            """
        else:
            template = self.get_summary_prompt_template()

        prompt = prompt_context + content_context + template

        def _clean_response(raw: str) -> str:
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
                if cleaned.endswith("```"):
                    cleaned = cleaned[:-3]
                cleaned = cleaned.strip()
                if "\n" in cleaned:
                    first_line, rest = cleaned.split("\n", 1)
                    if first_line.strip().lower() in ("json", "html"):
                        cleaned = rest
            return cleaned.strip()

        try:
            raw = self.model.inference(prompt, temperature=self.temperature)
            cleaned = _clean_response(raw)
            return get_summary_html(cleaned, self.get_theme_color())
        except Exception as e:
            print(f"[{self.name}] Summary generation failed: {e}")
            fallback = {
                "trend_summary": "Summary generation failed.",
                "recommendations": [],
                "additional_observation": "None.",
            }
            return render_summary_sections(fallback, self.get_theme_color())

    def get_theme_color(self) -> str:
        """Override to customize theme. Default is neutral gray."""
        return "36,41,46"

    def render_email(self, recommendations: list[dict]) -> str:
        if not recommendations:
            return framework.replace("__CONTENT__", get_empty_html())

        parts = [self.get_section_header()]
        for i, r in enumerate(tqdm(recommendations, desc=f"[{self.name}] Rendering", unit="item")):
            rate = get_stars(r.get("score", 0))
            parts.append(self.render_item_html(r))

        summary = self.summarize(recommendations)
        content = summary + "<br>" + "</br><br>".join(parts) + "</br>"
        email_html = framework.replace("__CONTENT__", content)

        # Save to history as a snapshot (not used as cache)
        if self.save_dir:
            email_path = os.path.join(self.save_dir, f"{self.name}_email.html")
            os.makedirs(os.path.dirname(email_path), exist_ok=True)
            with open(email_path, "w", encoding="utf-8") as f:
                f.write(email_html)

        return email_html

    @staticmethod
    def _send_email_html(html: str, email_config: EmailConfig, title: str, run_datetime=None):
        """Send an HTML email. Decoupled from recommendation fetching for reuse."""
        if run_datetime is None:
            run_datetime = datetime.now(timezone.utc)

        # Skip if email config is incomplete
        if not email_config.receiver or not email_config.sender or not email_config.smtp_server:
            print(f"[{title}] Email not sent: incomplete email configuration")
            return

        def _format_addr(s):
            name, addr = parseaddr(s)
            return formataddr((Header(name, "utf-8").encode(), addr))

        msg = MIMEText(html, "html", "utf-8")
        sender_display_name = "iDeer" if email_config.sender.strip().lower() == BaseSource.managed_sender_address else title
        msg["From"] = _format_addr(f"{sender_display_name} <{email_config.sender}>")

        receivers = [addr.strip() for addr in email_config.receiver.split(",")]
        msg["To"] = ",".join([_format_addr(f"You <{addr}>") for addr in receivers])

        today = run_datetime.strftime("%Y/%m/%d")
        msg["Subject"] = Header(f"{title} {today}", "utf-8").encode()

        try:
            if email_config.smtp_port == 465:
                server = smtplib.SMTP_SSL(email_config.smtp_server, email_config.smtp_port, timeout=20)
            else:
                server = smtplib.SMTP(email_config.smtp_server, email_config.smtp_port, timeout=20)
                server.ehlo()
                server.starttls()
                server.ehlo()
        except Exception as e:
            print(f"Primary SMTP mode failed: {e}, trying SSL fallback...")
            server = smtplib.SMTP_SSL(email_config.smtp_server, email_config.smtp_port, timeout=20)

        server.login(email_config.sender, email_config.sender_password)
        server.sendmail(email_config.sender, receivers, msg.as_string())
        server.quit()
        print(f"Email '{title}' sent to {receivers}")

    def send_email(self, email_config: EmailConfig, title: str | None = None):
        title = title or self.default_title
        recommendations = self.get_recommendations()
        html = self.render_email(recommendations)
        self._send_email_html(html, email_config, title, self.run_datetime)
        return recommendations
