import argparse
import json
import time

from base_source import BaseSource
from config import LLMConfig, CommonConfig
from fetchers.github_fetcher import get_trending_repos
from email_utils.base_template import get_stars
from email_utils.github_template import get_repo_block_html


class GitHubSource(BaseSource):
    name = "github"
    default_title = "Daily GitHub"

    def __init__(self, source_args: dict, llm_config: LLMConfig, common_config: CommonConfig):
        super().__init__(source_args, llm_config, common_config)
        self.languages = [lang.lower() for lang in source_args.get("languages", ["all"])]
        if "all" in self.languages:
            self.languages = ["all"]
        self.since = source_args.get("since", "daily")
        self.max_repos = source_args.get("max_repos", 30)

        self.repos = {}
        for lang in self.languages:
            cache_key = f"trending_{lang}_{self.since}"
            cached = self._load_fetch_cache(cache_key)
            if cached is not None:
                repos = cached
            else:
                repos = get_trending_repos(
                    language=None if lang == "all" else lang,
                    since=self.since,
                    max_results=self.max_repos * 2,
                )
                if repos:
                    self._save_fetch_cache(cache_key, repos)
                time.sleep(1)
            self.repos[lang] = repos
            print(f"[{self.name}] {len(repos)} trending repos for '{lang}'")

    @staticmethod
    def add_arguments(parser: argparse.ArgumentParser):
        parser.add_argument(
            "--gh_languages", nargs="+", default=["all"],
            help="[GitHub] Programming languages to filter (e.g., python javascript, or 'all')",
        )
        parser.add_argument(
            "--gh_since", type=str, choices=["daily", "weekly", "monthly"], default="daily",
            help="[GitHub] Time range for trending",
        )
        parser.add_argument(
            "--gh_max_repos", type=int, default=30,
            help="[GitHub] Max repos to recommend",
        )

    @staticmethod
    def extract_args(args) -> dict:
        return {
            "languages": args.gh_languages,
            "since": args.gh_since,
            "max_repos": args.gh_max_repos,
        }

    def get_max_items(self) -> int:
        return self.max_repos

    def fetch_items(self) -> list[dict]:
        all_repos = {}
        for lang, repos in self.repos.items():
            for repo in repos:
                repo_name = repo["repo_name"]
                if repo_name not in all_repos:
                    all_repos[repo_name] = repo
        print(f"[{self.name}] {len(all_repos)} unique repos after dedup")
        return list(all_repos.values())

    def get_item_cache_id(self, item: dict) -> str:
        return "repo_" + item.get("repo_name", "unknown").replace("/", "_")

    def build_eval_prompt(self, item: dict) -> str:
        prompt = """
            你是一个有帮助的技术助手，可以帮助我发现有价值的GitHub开源项目。
            以下是我感兴趣的技术领域描述：
            {}
        """.format(self.description)
        prompt += """
            以下是GitHub Trending上的一个热门项目：
            项目名称: {}
            项目描述: {}
            编程语言: {}
            总Star数: {}
            今日新增Star: {}
        """.format(
            item["repo_name"],
            item.get("description", "") or "无描述",
            item.get("language", "") or "未知",
            item.get("stars", 0),
            item.get("stars_today", 0),
        )
        prompt += """
            请评估这个项目：
            1. 用中文简要总结这个项目的主要功能和价值。
            2. 判断项目类型（工具/框架/库/应用/其他）。
            3. 评估这个项目与我兴趣领域的相关性，并给出 0-10 的评分。其中 0 表示完全不相关，10 表示高度相关。
            4. 列出 2-3 个项目的亮点特性。

            请按以下 JSON 格式给出你的回答：
            {
                "summary": "一段纯文本的中文总结（不要嵌套JSON/dict，直接写一段话）",
                "category": "工具/框架/库/应用/其他",
                "relevance": <你的评分>,
                "highlights": ["亮点1", "亮点2", "亮点3"]
            }
            重要：summary 必须是一段纯文本字符串，不要返回嵌套的 JSON 对象或字典。
            使用中文回答。
            直接返回上述 JSON 格式，无需任何额外解释。
        """
        return prompt

    def parse_eval_response(self, item: dict, response: str) -> dict:
        response = response.strip("```").strip("json")
        data = json.loads(response)
        return {
            "title": item["repo_name"],
            "repo_name": item["repo_name"],
            "owner": item.get("owner", ""),
            "name": item.get("name", ""),
            "description": item.get("description", ""),
            "language": item.get("language", ""),
            "summary": self._ensure_str(data["summary"]),
            "category": data.get("category", "其他"),
            "score": float(data["relevance"]),
            "highlights": data.get("highlights", []),
            "stars": item.get("stars", 0),
            "stars_today": item.get("stars_today", 0),
            "forks": item.get("forks", 0),
            "url": item["repo_url"],
        }

    def render_item_html(self, item: dict) -> str:
        rate = get_stars(item.get("score", 0))
        idx = ""  # index is added by render_email in base
        return get_repo_block_html(
            item["title"],
            rate,
            item["repo_name"],
            item["summary"],
            item["url"],
            item.get("stars", 0),
            item.get("stars_today", 0),
            item.get("forks", 0),
            item.get("language", ""),
        )

    def get_theme_color(self) -> str:
        return "36,41,46"

    def get_section_header(self) -> str:
        return f'<div class="section-title" style="border-bottom-color: #24292e;">🔥 GitHub Trending ({self.since})</div>'

    def build_summary_overview(self, recommendations: list[dict]) -> str:
        overview = ""
        for i, r in enumerate(recommendations):
            overview += f"{i + 1}. {r['repo_name']} ({r.get('language', '')}) - ⭐ {r.get('stars', 0)} stars (+{r.get('stars_today', 0)} today) - {r['summary']}\n"
        return overview

    def get_summary_prompt_template(self) -> str:
        return """
            请直接输出一段 HTML 片段，严格遵循以下结构，不要包含 JSON、Markdown 或多余说明：
            <div class="summary-wrapper">
              <div class="summary-section">
                <h2>今日GitHub趋势</h2>
                <p>分析今天热门项目体现的技术趋势...</p>
              </div>
              <div class="summary-section">
                <h2>重点推荐</h2>
                <ol class="summary-list">
                  <li class="summary-item">
                    <div class="summary-item__header"><span class="summary-item__title">项目名</span><span class="summary-pill">类型</span></div>
                    <p class="summary-item__stars">⭐ XXX stars (+YYY today)</p>
                    <p><strong>推荐理由：</strong>...</p>
                    <p><strong>亮点特性：</strong>...</p>
                  </li>
                </ol>
              </div>
              <div class="summary-section">
                <h2>补充观察</h2>
                <p>值得关注的技术方向或潜在趋势...</p>
              </div>
            </div>

            注意：每个重点推荐项目必须包含该项目的真实 star 数据（从上面的摘要中提取），格式为 "⭐ XXX stars (+YYY today)"。
            用中文撰写内容，重点推荐部分建议返回 3-5 个项目。
        """
