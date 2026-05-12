import argparse
import hashlib
import html
import json
import os

from core.config import LLMConfig, CommonConfig
from email_utils.base_template import get_stars
from fetchers.rss_fetcher import DEFAULT_RSS_URLS, fetch_rss_feeds
from sources.base import BaseSource


class RssSource(BaseSource):
    name = "rss"
    default_title = "RSS Daily"

    def __init__(self, source_args: dict, llm_config: LLMConfig, common_config: CommonConfig):
        super().__init__(source_args, llm_config, common_config)
        self.urls = source_args.get("urls") or DEFAULT_RSS_URLS
        self.max_items = source_args.get("max_items", 30)

        url_sig = hashlib.sha256("|".join(sorted(self.urls)).encode()).hexdigest()[:10]
        cache_key = f"items_{url_sig}_{self.max_items}"
        cached = self._load_fetch_cache(cache_key)
        if cached is not None:
            self.items = cached
        else:
            self.items = fetch_rss_feeds(self.urls, max_items=self.max_items)
            if self.items:
                self._save_fetch_cache(cache_key, self.items)

    @staticmethod
    def add_arguments(parser: argparse.ArgumentParser):
        default_urls = os.getenv("RSS_URLS", " ".join(DEFAULT_RSS_URLS)).split()
        parser.add_argument(
            "--rss_urls", nargs="+", default=default_urls,
            help="[RSS] Feed URLs to fetch",
        )
        parser.add_argument(
            "--rss_max_items", type=int, default=int(os.getenv("RSS_MAX_ITEMS", "30")),
            help="[RSS] Max items to fetch and recommend",
        )

    @staticmethod
    def extract_args(args) -> dict:
        return {
            "urls": args.rss_urls,
            "max_items": args.rss_max_items,
        }

    def fetch_items(self) -> list[dict]:
        print(f"[{self.name}] {len(self.items)} RSS items available")
        return self.items

    def get_item_cache_id(self, item: dict) -> str:
        return item.get("cache_id", "rss_unknown")

    def get_max_items(self) -> int:
        return self.max_items

    def build_eval_prompt(self, item: dict) -> str:
        summary = item.get("summary") or item.get("abstract") or "No summary available."
        if len(summary) > 1200:
            summary = summary[:1197] + "..."
        return f"""你是一个有帮助的信息筛选助手，可以帮助我构建每日 AI 信息源摘要。
以下是我最近研究领域的描述：
{self.description}

以下是来自 RSS 订阅的信息：
来源: {item.get('source_label', 'RSS')}
标题: {item.get('title', '')}
发布时间: {item.get('published_at', '')}
内容: {summary}

1. 用中文总结这条信息的主要内容。
2. 请评估这条信息与我研究领域的相关性，并给出 0-10 的评分。其中 0 表示完全不相关，10 表示高度相关。

请按以下 JSON 格式给出你的回答：
{{
    "summary": "一段纯文本的中文总结（不要嵌套JSON/dict，直接写一段话）",
    "relevance": <你的评分>
}}
重要：summary 必须是一段纯文本字符串，不要返回嵌套的 JSON 对象或字典。
使用中文回答。
直接返回上述 JSON 格式，无需任何额外解释。"""

    def parse_eval_response(self, item: dict, response: str) -> dict:
        response = response.strip("```").strip("json")
        data = json.loads(response)
        return {
            "title": item.get("title", "Untitled"),
            "summary": self._ensure_str(data["summary"]),
            "score": float(data["relevance"]),
            "url": item.get("url", ""),
            "abstract": item.get("abstract", ""),
            "published_at": item.get("published_at", ""),
            "feed_url": item.get("feed_url", ""),
            "source_label": item.get("source_label", "RSS"),
        }

    def render_item_html(self, item: dict) -> str:
        rate = get_stars(item.get("score", 0))
        title = html.escape(item.get("title", "Untitled"))
        summary = html.escape(item.get("summary", ""))
        url = html.escape(item.get("url", ""))
        source_label = html.escape(item.get("source_label", "RSS"))
        published_at = html.escape(item.get("published_at", ""))
        meta = " · ".join(part for part in [source_label, published_at] if part)
        meta_html = f'<p style="color:#6b7280;margin:4px 0 8px 0;">{meta}</p>' if meta else ""
        link_html = f'<p><a href="{url}">Open item</a></p>' if url else ""
        return f"""
        <div class="recommendation-item">
          <h3>{title}</h3>
          <p>{rate}</p>
          {meta_html}
          <p>{summary}</p>
          {link_html}
        </div>
        """

    def get_theme_color(self) -> str:
        return "14,116,144"

    def get_section_header(self) -> str:
        return '<div class="section-title" style="border-bottom-color: #0e7490;">📰 RSS Feeds</div>'

    def build_summary_overview(self, recommendations: list[dict]) -> str:
        lines = []
        for i, r in enumerate(recommendations):
            lines.append(
                f"{i + 1}. {r.get('title', 'Untitled')} "
                f"({r.get('source_label', 'RSS')}) - Score: {r.get('score', 0)} - {r.get('summary', '')}"
            )
        return "\n".join(lines)

    def get_summary_prompt_template(self) -> str:
        return """
            请直接输出一段 HTML 片段，严格遵循以下结构，不要包含 JSON、Markdown 或多余说明：
            <div class="summary-wrapper">
              <div class="summary-section">
                <h2>今日 RSS 信息源动态</h2>
                <p>概括今天 RSS 订阅里最值得关注的趋势...</p>
              </div>
              <div class="summary-section">
                <h2>重点推荐</h2>
                <ol class="summary-list">
                  <li class="summary-item">
                    <div class="summary-item__header"><span class="summary-item__title">信息标题</span><span class="summary-pill">来源</span></div>
                    <p><strong>推荐理由：</strong>...</p>
                    <p><strong>关键内容：</strong>...</p>
                  </li>
                </ol>
              </div>
              <div class="summary-section">
                <h2>补充观察</h2>
                <p>其他值得持续关注的方向...</p>
              </div>
            </div>

            用中文撰写内容，重点推荐部分建议返回 3-5 条信息。
        """
