import argparse
import hashlib
import json

from sources.base import BaseSource
from core.config import LLMConfig, CommonConfig
from fetchers.pubmed_fetcher import fetch_papers_for_queries
from email_utils.base_template import get_stars
from email_utils.pubmed_template import get_paper_block_html


class PubMedSource(BaseSource):
    name = "pubmed"
    default_title = "PubMed Daily"

    def __init__(self, source_args: dict, llm_config: LLMConfig, common_config: CommonConfig):
        super().__init__(source_args, llm_config, common_config)
        self.queries = source_args.get("queries", [])
        self.max_results = source_args.get("max_results", 50)
        self.max_papers = source_args.get("max_papers", 15)
        self.days = source_args.get("days", 7)
        self.api_key = source_args.get("api_key", "")

        if not self.queries:
            self.queries = self._derive_queries_from_description()

        query_sig = hashlib.sha256(
            "|".join(sorted(self.queries)).encode()
        ).hexdigest()[:10]
        cache_key = f"papers_{query_sig}_{self.max_results}_{self.days}"
        cached = self._load_fetch_cache(cache_key)
        if cached is not None:
            self.raw_papers = cached
        else:
            self.raw_papers = fetch_papers_for_queries(
                self.queries,
                max_results_per_query=self.max_results,
                days=self.days,
                api_key=self.api_key,
            )
            if self.raw_papers:
                self._save_fetch_cache(cache_key, self.raw_papers)

    def _derive_queries_from_description(self) -> list[str]:
        desc = self.description.strip()
        if not desc:
            return ["biomedical"]

        lines = [line.strip().lstrip("0123456789.-) ") for line in desc.split("\n") if line.strip()]
        queries = []
        for line in lines:
            lower = line.lower()
            if any(neg in lower for neg in ("not interested", "不感兴趣", "don't", "exclude")):
                continue
            for prefix in ("i'm interested in", "interested in", "关注", "研究"):
                if lower.startswith(prefix):
                    line = line[len(prefix):].strip(" :：-")
            if line and len(line) > 2:
                queries.append(line[:120])
            if len(queries) >= 3:
                break

        return queries or ["biomedical"]

    @staticmethod
    def add_arguments(parser: argparse.ArgumentParser):
        parser.add_argument(
            "--pm_queries", nargs="*", default=[],
            help="[PubMed] Search queries (derived from description if empty)",
        )
        parser.add_argument(
            "--pm_max_results", type=int, default=50,
            help="[PubMed] Max results to fetch per query",
        )
        parser.add_argument(
            "--pm_max_papers", type=int, default=15,
            help="[PubMed] Max papers to recommend",
        )
        parser.add_argument(
            "--pm_days", type=int, default=7,
            help="[PubMed] Fetch papers from last N days",
        )
        parser.add_argument(
            "--pm_api_key", type=str, default="",
            help="[PubMed] NCBI API key (optional, increases rate limit)",
        )

    @staticmethod
    def extract_args(args) -> dict:
        return {
            "queries": args.pm_queries,
            "max_results": args.pm_max_results,
            "max_papers": args.pm_max_papers,
            "days": args.pm_days,
            "api_key": args.pm_api_key,
        }

    def fetch_items(self) -> list[dict]:
        print(f"[{self.name}] {len(self.raw_papers)} papers available")
        return self.raw_papers

    def get_item_cache_id(self, item: dict) -> str:
        pid = item.get("paper_id", "unknown")
        return "pm_" + str(pid).replace("/", "_").replace(".", "_")[:80]

    def get_max_items(self) -> int:
        return self.max_papers

    def build_eval_prompt(self, item: dict) -> str:
        abstract = item.get("abstract", "") or "No abstract available."
        if len(abstract) > 600:
            abstract = abstract[:597] + "..."

        return f"""你是一个有帮助的学术研究助手，可以帮助我构建每日论文推荐系统。
以下是我最近研究领域的描述：
{self.description}

以下是来自 PubMed 的论文：
标题: {item['title']}
作者: {item.get('authors', '')}
期刊: {item.get('journal', '')}
年份: {item.get('year', '')}
摘要: {abstract}

1. 总结这篇论文的主要内容。
2. 请评估这篇论文与我研究领域的相关性，并给出 0-10 的评分。其中 0 表示完全不相关，10 表示高度相关。

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
            "title": item["title"],
            "paper_id": item.get("paper_id", ""),
            "abstract": item.get("abstract", ""),
            "summary": self._ensure_str(data["summary"]),
            "score": float(data["relevance"]),
            "url": item.get("url", ""),
            "authors": item.get("authors", ""),
            "journal": item.get("journal", ""),
            "year": str(item.get("year", "")),
            "doi": item.get("doi", ""),
        }

    def render_item_html(self, item: dict) -> str:
        rate = get_stars(item.get("score", 0))
        return get_paper_block_html(
            item["title"],
            rate,
            item.get("authors", ""),
            item.get("journal", ""),
            str(item.get("year", "")),
            item.get("paper_id", ""),
            item["summary"],
            item.get("url", ""),
        )

    def get_theme_color(self) -> str:
        return "46,125,50"  # PubMed green

    def get_section_header(self) -> str:
        query_hint = ", ".join(self.queries[:2])
        if len(self.queries) > 2:
            query_hint += f" +{len(self.queries) - 2}"
        return f'<div class="section-title" style="border-bottom-color: #2e7d32;">🏥 PubMed ({query_hint})</div>'

    def build_summary_overview(self, recommendations: list[dict]) -> str:
        overview = ""
        for i, r in enumerate(recommendations):
            journal = r.get("journal", "")
            year = r.get("year", "")
            meta = f" ({journal}, {year})" if journal else f" ({year})" if year else ""
            overview += f"{i + 1}. {r['title']}{meta} - {r['summary']}\n"
        return overview

    def get_summary_prompt_template(self) -> str:
        return """
            请直接输出一段 HTML 片段，严格遵循以下结构，不要包含 JSON、Markdown 或多余说明：
            <div class="summary-wrapper">
              <div class="summary-section">
                <h2>今日 PubMed 动态</h2>
                <p>分析今天的论文趋势...</p>
              </div>
              <div class="summary-section">
                <h2>重点推荐</h2>
                <ol class="summary-list">
                  <li class="summary-item">
                    <div class="summary-item__header"><span class="summary-item__title">标题</span><span class="summary-pill">期刊</span></div>
                    <p><strong>推荐理由：</strong>...</p>
                    <p><strong>关键发现：</strong>...</p>
                  </li>
                </ol>
              </div>
              <div class="summary-section">
                <h2>补充观察</h2>
                <p>其他值得关注的方向...</p>
              </div>
            </div>

            用中文撰写内容，重点推荐部分建议返回 3-5 篇论文。
        """
