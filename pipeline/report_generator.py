"""Generate a cross-source personalized narrative report from daily recommendations."""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from typing import Any

from sources.base import BaseSource
from core.config import CommonConfig, EmailConfig, LLMConfig, PROJECT_ROOT
from email_utils.report_template import render_report_email
from llm.GPT import GPT
from llm.Ollama import Ollama

REPORT_EMAIL_TITLE = "Daily Personal Briefing"


class ReportGenerator:
    def __init__(
        self,
        all_recs: dict[str, list[dict]],
        profile_text: str,
        llm_config: LLMConfig,
        common_config: CommonConfig,
        report_title: str = REPORT_EMAIL_TITLE,
        min_score: float = 4.0,
        max_items: int = 18,
        theme_count: int = 4,
        prediction_count: int = 4,
        idea_count: int = 4,
    ):
        self.all_recs = all_recs
        self.profile_text = profile_text.strip()
        self.llm_config = llm_config
        self.common_config = common_config
        self.report_title = report_title
        self.min_score = min_score
        self.max_items = max_items
        self.theme_count = theme_count
        self.prediction_count = prediction_count
        self.idea_count = idea_count

        self.run_datetime = datetime.now(timezone.utc)
        self.run_date = self.run_datetime.strftime("%Y-%m-%d")

        self.model = self._build_model(llm_config)

        base_dir = str(PROJECT_ROOT)
        self.save_dir = os.path.join(base_dir, common_config.save_dir, "reports", self.run_date)
        self.email_cache_path = os.path.join(self.save_dir, "report.html")

        if common_config.save:
            os.makedirs(self.save_dir, exist_ok=True)

    @staticmethod
    def _build_model(llm_config: LLMConfig):
        provider = llm_config.provider.lower()
        if provider == "ollama":
            return Ollama(llm_config.model)
        if provider in ("openai", "siliconflow"):
            return GPT(llm_config.model, llm_config.base_url, llm_config.api_key)
        raise ValueError(f"Unsupported LLM provider: {provider}")

    @staticmethod
    def _safe_float(value: Any) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _truncate(text: str, limit: int) -> str:
        text = str(text or "").strip().replace("\n", " ")
        if len(text) <= limit:
            return text
        return text[: limit - 3].rstrip() + "..."

    @staticmethod
    def _format_time(text: str) -> str:
        raw = str(text or "").strip()
        if not raw:
            return ""
        try:
            return datetime.fromisoformat(raw).astimezone().strftime("%Y-%m-%d %H:%M")
        except ValueError:
            return raw

    def _normalize_item(self, source_name: str, rec: dict) -> dict:
        source_label = {
            "github": "GitHub",
            "huggingface": "HuggingFace",
            "twitter": "X/Twitter",
        }.get(source_name, source_name)
        score = self._safe_float(rec.get("score", 0))
        summary = str(rec.get("summary", "")).strip()
        url = str(rec.get("url", "")).strip()

        normalized = {
            "source": source_name,
            "source_label": source_label,
            "score": round(score, 2),
            "title": str(rec.get("title", "Untitled")).strip(),
            "summary": summary,
            "url": url,
            "category": str(rec.get("category", "")).strip(),
            "time": "",
            "metrics": "",
            "entity": "",
            "detail": "",
        }

        if source_name == "github":
            normalized["entity"] = str(rec.get("repo_name", rec.get("title", ""))).strip()
            normalized["detail"] = " / ".join(
                part
                for part in [
                    str(rec.get("language", "")).strip(),
                    self._truncate(rec.get("description", ""), 220),
                    "；".join(str(x).strip() for x in rec.get("highlights", [])[:3] if str(x).strip()),
                ]
                if part
            )
            normalized["metrics"] = (
                f"stars={int(rec.get('stars', 0) or 0)}, "
                f"stars_today={int(rec.get('stars_today', 0) or 0)}, "
                f"forks={int(rec.get('forks', 0) or 0)}"
            )
        elif source_name == "huggingface":
            hf_type = str(rec.get("_hf_type", "")).strip() or "item"
            normalized["category"] = hf_type
            normalized["entity"] = str(rec.get("id", rec.get("title", ""))).strip()
            if hf_type == "paper":
                normalized["detail"] = self._truncate(rec.get("abstract", ""), 260)
                normalized["metrics"] = f"upvotes={int(rec.get('upvotes', 0) or 0)}"
            else:
                tags = ", ".join(str(x).strip() for x in rec.get("tags", [])[:6] if str(x).strip())
                normalized["detail"] = " / ".join(
                    part for part in [self._truncate(rec.get("description", ""), 200), tags] if part
                )
                normalized["metrics"] = (
                    f"likes={int(rec.get('likes', 0) or 0)}, "
                    f"downloads={int(rec.get('downloads', 0) or 0)}"
                )
        elif source_name == "twitter":
            author = str(rec.get("author_name", rec.get("author_username", ""))).strip()
            handle = str(rec.get("author_username", "")).strip()
            normalized["entity"] = f"{author} (@{handle})" if author and handle else author or handle
            normalized["time"] = self._format_time(rec.get("created_at", ""))
            normalized["detail"] = " / ".join(
                part
                for part in [
                    self._truncate(rec.get("text", ""), 280),
                    "；".join(str(x).strip() for x in rec.get("key_points", [])[:3] if str(x).strip()),
                ]
                if part
            )
            normalized["metrics"] = (
                f"likes={int(rec.get('likes', 0) or 0)}, "
                f"retweets={int(rec.get('retweets', 0) or 0)}, "
                f"replies={int(rec.get('replies', 0) or 0)}"
            )

        return normalized

    def _filter_items(self) -> list[dict]:
        normalized: list[dict] = []
        for source_name, recs in self.all_recs.items():
            source_items = [self._normalize_item(source_name, rec) for rec in recs]
            source_items.sort(key=lambda item: item.get("score", 0), reverse=True)
            qualified = [item for item in source_items if item.get("score", 0) >= self.min_score]
            if not qualified:
                qualified = source_items[: min(3, len(source_items))]
            normalized.extend(qualified)

        if not normalized:
            return []

        by_source: dict[str, list[dict]] = {}
        for item in normalized:
            by_source.setdefault(item["source"], []).append(item)

        selected: list[dict] = []
        source_names = sorted(
            by_source.keys(),
            key=lambda name: by_source[name][0].get("score", 0),
            reverse=True,
        )
        index_by_source = {name: 0 for name in source_names}

        while len(selected) < self.max_items:
            added_any = False
            for source_name in source_names:
                source_items = by_source[source_name]
                source_index = index_by_source[source_name]
                if source_index >= len(source_items):
                    continue
                selected.append(source_items[source_index])
                index_by_source[source_name] += 1
                added_any = True
                if len(selected) >= self.max_items:
                    break
            if not added_any:
                break

        return selected

    def _format_item_for_prompt(self, item: dict, index: int) -> str:
        lines = [
            f"[{index}] source={item.get('source')} / score={item.get('score', 0)}",
            f"title={item.get('title', '')}",
        ]
        if item.get("entity"):
            lines.append(f"entity={item.get('entity')}")
        if item.get("category"):
            lines.append(f"category={item.get('category')}")
        if item.get("time"):
            lines.append(f"time={item.get('time')}")
        if item.get("metrics"):
            lines.append(f"metrics={item.get('metrics')}")
        if item.get("summary"):
            lines.append(f"summary={item.get('summary')}")
        if item.get("detail"):
            lines.append(f"detail={item.get('detail')}")
        if item.get("url"):
            lines.append(f"url={item.get('url')}")
        return "\n".join(lines)

    def _build_prompt(self, filtered_items: list[dict]) -> str:
        items_text = "\n\n".join(
            self._format_item_for_prompt(item, index)
            for index, item in enumerate(filtered_items, 1)
        )
        profile_excerpt = self._truncate(self.profile_text, 6000)

        return f"""You are writing a personalized cross-platform daily briefing for a single reader.

The output language must be Simplified Chinese, but keep the reasoning prompt in English and do not return any explanatory preamble.

Reader profile:
{profile_excerpt}

Curated source material for today:
{items_text}

Your job:
1. Infer the 3-{self.theme_count} most important storylines across the materials.
2. Write the first half like a coherent human-readable report, not a feed dump, not account-by-account notes, and not a sequence of isolated bullets.
3. Use the back half to provide your own interpretation, short-horizon predictions, and concrete ideas.
4. Prefer cross-source synthesis when possible. Connect social signals, repos, papers, and models into a single narrative.
5. Be explicit about uncertainty. Separate observed facts from inference.
6. Do not invent evidence. Every concrete claim should be grounded in the provided material.

Output strict JSON only. No markdown fence. No extra text.

Schema:
{{
  "report_title": "A sharp Chinese report title",
  "subtitle": "One-sentence Chinese subtitle tailored to the reader",
  "opening": "2-3 connected Chinese paragraphs that read like an analyst briefing",
  "themes": [
    {{
      "title": "Short Chinese theme title",
      "narrative": "One substantial Chinese paragraph",
      "signals": [
        {{
          "source": "github/twitter/huggingface",
          "title": "signal title",
          "why_it_matters": "one-sentence Chinese significance",
          "url": "https://..."
        }}
      ]
    }}
  ],
  "interpretation": {{
    "thesis": "1-2 Chinese paragraphs of interpretation",
    "implications": "1 Chinese paragraph on what this may imply next"
  }},
  "predictions": [
    {{
      "prediction": "Chinese prediction",
      "time_horizon": "e.g. 1-2周 / 1-3个月",
      "confidence": "高/中/低",
      "rationale": "Chinese rationale grounded in today's signals"
    }}
  ],
  "ideas": [
    {{
      "title": "Chinese idea title",
      "detail": "Chinese idea description",
      "why_now": "Why this is timely now"
    }}
  ],
  "watchlist": [
    {{
      "item": "Chinese watch item",
      "reason": "Chinese reason"
    }}
  ]
}}

Requirements:
- Keep "themes" to at most {self.theme_count}.
- Keep "predictions" to exactly {self.prediction_count} if enough evidence exists, otherwise fewer.
- Keep "ideas" to exactly {self.idea_count} if enough evidence exists, otherwise fewer.
- In the opening and interpretation, write fluent continuous prose, not bullet fragments.
- In the signals list, prefer the strongest evidence rather than exhaustive coverage.
"""

    @staticmethod
    def _clean_llm_json(raw: str) -> str:
        cleaned = str(raw or "").strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)

        first_brace = cleaned.find("{")
        last_brace = cleaned.rfind("}")
        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            cleaned = cleaned[first_brace:last_brace + 1]
        return cleaned.strip()

    @staticmethod
    def _safe_slug(text: str, limit: int = 32) -> str:
        compact = re.sub(r"\s+", " ", str(text or "").strip())
        return compact[:limit].rstrip(" /-_")

    def _parse_json_object(self, raw: str) -> dict[str, Any] | None:
        cleaned = self._clean_llm_json(raw)
        if not cleaned:
            return None

        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError:
            return None

        return data if isinstance(data, dict) else None

    def _build_repair_prompt(self, invalid_json: str) -> str:
        return f"""You are fixing invalid JSON produced by another model.

Return valid JSON only. No markdown fence. No commentary.
Keep the original meaning, preserve Chinese text, and keep the same schema.
If a field is missing, keep it as an empty string, empty array, or empty object as appropriate.
Do not add any fields outside the schema.

Invalid JSON:
{invalid_json}
"""

    def _repair_report_json(self, invalid_json: str) -> dict[str, Any] | None:
        print("[ReportGenerator] Attempting JSON repair pass.")
        repair_prompt = self._build_repair_prompt(invalid_json)
        repaired_raw = self.model.inference(repair_prompt, temperature=0.0)
        repaired = self._parse_json_object(repaired_raw)
        if repaired is None:
            print("[ReportGenerator] JSON repair pass failed.")
        return repaired

    @staticmethod
    def _normalize_signal(signal: dict[str, Any]) -> dict[str, str]:
        return {
            "source": str(signal.get("source", "")).strip(),
            "title": str(signal.get("title", "")).strip(),
            "why_it_matters": str(signal.get("why_it_matters", "")).strip(),
            "url": str(signal.get("url", "")).strip(),
        }

    def _fallback_signals(self, filtered_items: list[dict], limit: int = 3) -> list[dict[str, str]]:
        signals = []
        for item in filtered_items[:limit]:
            signals.append(
                {
                    "source": str(item.get("source", "")),
                    "title": str(item.get("title", "")),
                    "why_it_matters": str(item.get("summary", "")),
                    "url": str(item.get("url", "")),
                }
            )
        return signals

    def _build_fallback_report(self, filtered_items: list[dict], reason: str) -> dict[str, Any]:
        top_items = filtered_items[: max(1, min(self.max_items, len(filtered_items)))]
        source_counts: dict[str, int] = {}
        for item in top_items:
            source_counts[item["source"]] = source_counts.get(item["source"], 0) + 1

        source_line = " / ".join(
            item["source_label"] for item in top_items[:3] if item.get("source_label")
        )
        top_titles = "、".join(self._safe_slug(item.get("title", "")) for item in top_items[:3])
        opening = (
            f"今天的高分信号主要来自 {source_line or '多源'}。"
            f"当前最值得优先关注的条目包括 {top_titles}。"
            f"这份版本基于已完成的抓取与评分结果自动整理，重点保留了可直接阅读的主线、观察点和后续跟踪对象。"
        )

        themes = []
        for item in top_items[: self.theme_count]:
            detail = str(item.get("summary", "")).strip() or str(item.get("detail", "")).strip()
            if not detail:
                detail = "该条目在今天的筛选结果中得分较高，值得继续跟踪。"
            narrative = (
                f"{item.get('source_label', item.get('source', ''))} 信号里，"
                f"《{item.get('title', 'Untitled')}》是今天的重点条目之一。"
                f"{detail}"
            )
            themes.append(
                {
                    "title": self._safe_slug(item.get("title", "Untitled"), limit=48) or "今日重点信号",
                    "narrative": narrative,
                    "signals": [
                        {
                            "source": str(item.get("source", "")),
                            "title": str(item.get("title", "")),
                            "why_it_matters": detail,
                            "url": str(item.get("url", "")),
                        }
                    ],
                }
            )

        predictions = []
        for item in top_items[: self.prediction_count]:
            predictions.append(
                {
                    "prediction": f"{self._safe_slug(item.get('title', '该主题'), limit=40)} 相关讨论会继续升温",
                    "time_horizon": "1-2周",
                    "confidence": "中",
                    "rationale": (
                        f"该条目来自 {item.get('source_label', item.get('source', ''))}，"
                        f"在今日结果中得分为 {item.get('score', 0)}，并进入了高优先级筛选。"
                    ),
                }
            )

        ideas = []
        for item in top_items[: self.idea_count]:
            ideas.append(
                {
                    "title": f"围绕 {self._safe_slug(item.get('title', '该主题'), limit=28)} 做一次定向跟踪",
                    "detail": (
                        f"把该条目加入后续观察清单，继续跟踪相关 repo、论文、讨论和社区反馈，"
                        "补齐背景脉络和潜在应用机会。"
                    ),
                    "why_now": "它已经在今天的多源筛选中进入高分区，短期内最有继续跟踪价值。",
                }
            )

        watchlist = []
        for item in top_items[:5]:
            reason_text = str(item.get("summary", "")).strip() or str(item.get("detail", "")).strip()
            watchlist.append(
                {
                    "item": self._safe_slug(item.get("title", "Untitled"), limit=52) or "重点条目",
                    "reason": reason_text or "今天的多源筛选结果中优先级较高。",
                }
            )

        return {
            "report_title": self.report_title or "今日多源趋势速递",
            "subtitle": "基于已完成抓取结果生成的稳定版自动汇总",
            "opening": opening,
            "themes": themes,
            "interpretation": {
                "thesis": (
                    "今天的信号重心比较明确：高分内容集中在少数几个最强条目上，"
                    "适合先围绕这些对象做连续追踪，而不是平均分配注意力。"
                ),
                "implications": (
                    "这份报告是降级生成版本，用来保证定时任务稳定产出。"
                    "即使模型返回了不完整 JSON，核心观察和后续跟踪对象仍然被保留下来。"
                ),
            },
            "predictions": predictions,
            "ideas": ideas,
            "watchlist": watchlist,
            "metadata": {
                "date": self.run_date,
                "generated_at": self.run_datetime.isoformat(),
                "source_counts": source_counts,
                "input_item_count": len(filtered_items),
                "generation_mode": "fallback",
                "fallback_reason": reason,
            },
        }

    def _normalize_report(self, data: dict[str, Any], filtered_items: list[dict]) -> dict[str, Any]:
        title = str(data.get("report_title", "")).strip() or self.report_title
        subtitle = str(data.get("subtitle", "")).strip()
        opening = str(data.get("opening", "")).strip()
        item_by_url = {
            str(item.get("url", "")).strip(): item
            for item in filtered_items
            if str(item.get("url", "")).strip()
        }
        item_by_title = {
            str(item.get("title", "")).strip(): item
            for item in filtered_items
            if str(item.get("title", "")).strip()
        }

        themes = []
        for theme in data.get("themes") or []:
            if not isinstance(theme, dict):
                continue
            theme_title = str(theme.get("title", "")).strip()
            narrative = str(theme.get("narrative", "")).strip()
            signals = []
            for signal in theme.get("signals") or []:
                if isinstance(signal, dict):
                    normalized_signal = self._normalize_signal(signal)
                    matched_item = None
                    if normalized_signal["url"]:
                        matched_item = item_by_url.get(normalized_signal["url"])
                    if not matched_item and normalized_signal["title"]:
                        matched_item = item_by_title.get(normalized_signal["title"])
                    if matched_item:
                        if not normalized_signal["source"]:
                            normalized_signal["source"] = str(matched_item.get("source", "")).strip()
                        if not normalized_signal["why_it_matters"]:
                            normalized_signal["why_it_matters"] = str(
                                matched_item.get("summary", "")
                            ).strip()
                    if normalized_signal["title"]:
                        signals.append(normalized_signal)
            if theme_title and narrative:
                themes.append(
                    {
                        "title": theme_title,
                        "narrative": narrative,
                        "signals": signals or self._fallback_signals(filtered_items, limit=2),
                    }
                )
        themes = themes[: self.theme_count]

        interpretation_raw = data.get("interpretation") or {}
        if not isinstance(interpretation_raw, dict):
            interpretation_raw = {}
        interpretation = {
            "thesis": str(interpretation_raw.get("thesis", "")).strip(),
            "implications": str(interpretation_raw.get("implications", "")).strip(),
        }

        predictions = []
        for prediction in data.get("predictions") or []:
            if not isinstance(prediction, dict):
                continue
            content = str(prediction.get("prediction", "")).strip()
            if not content:
                continue
            predictions.append(
                {
                    "prediction": content,
                    "time_horizon": str(prediction.get("time_horizon", "")).strip(),
                    "confidence": str(prediction.get("confidence", "")).strip(),
                    "rationale": str(prediction.get("rationale", "")).strip(),
                }
            )
        predictions = predictions[: self.prediction_count]

        ideas = []
        for idea in data.get("ideas") or []:
            if not isinstance(idea, dict):
                continue
            idea_title = str(idea.get("title", "")).strip()
            if not idea_title:
                continue
            ideas.append(
                {
                    "title": idea_title,
                    "detail": str(idea.get("detail", "")).strip(),
                    "why_now": str(idea.get("why_now", "")).strip(),
                }
            )
        ideas = ideas[: self.idea_count]

        watchlist = []
        for watch in data.get("watchlist") or []:
            if not isinstance(watch, dict):
                continue
            item = str(watch.get("item", "")).strip()
            reason = str(watch.get("reason", "")).strip()
            if item:
                watchlist.append({"item": item, "reason": reason})

        return {
            "report_title": title,
            "subtitle": subtitle,
            "opening": opening,
            "themes": themes,
            "interpretation": interpretation,
            "predictions": predictions,
            "ideas": ideas,
            "watchlist": watchlist,
            "metadata": {
                "date": self.run_date,
                "generated_at": self.run_datetime.isoformat(),
                "source_counts": {
                    source_name: len(recs) for source_name, recs in self.all_recs.items()
                },
                "input_item_count": len(filtered_items),
            },
        }

    def generate(self) -> dict[str, Any] | None:
        filtered = self._filter_items()
        if not filtered:
            print("[ReportGenerator] No recommendation items available for report generation.")
            return None

        print(
            f"[ReportGenerator] Building report from {len(filtered)} curated items "
            f"(min_score={self.min_score})."
        )
        prompt = self._build_prompt(filtered)
        raw = self.model.inference(prompt, temperature=self.llm_config.temperature)
        cleaned = self._clean_llm_json(raw)
        data = self._parse_json_object(cleaned)

        if data is None:
            try:
                json.loads(cleaned)
            except json.JSONDecodeError as e:
                print(f"[ReportGenerator] Failed to parse report JSON: {e}")
            else:
                print("[ReportGenerator] LLM response is not a JSON object.")
            print(f"[ReportGenerator] Raw response (first 600 chars): {cleaned[:600]}")
            data = self._repair_report_json(cleaned)

        if data is None:
            print("[ReportGenerator] Falling back to deterministic report rendering.")
            report = self._build_fallback_report(
                filtered,
                reason="llm_report_json_invalid",
            )
            report["input_items"] = filtered
            return report

        report = self._normalize_report(data, filtered)
        report["input_items"] = filtered
        return report

    def render_email(self, report: dict[str, Any]) -> str:
        html = render_report_email(report)
        if self.common_config.save:
            os.makedirs(self.save_dir, exist_ok=True)
            with open(self.email_cache_path, "w", encoding="utf-8") as f:
                f.write(html)
        return html

    def save(self, report: dict[str, Any]) -> None:
        if not self.common_config.save:
            print("[ReportGenerator] Save disabled, skipping.")
            return

        os.makedirs(self.save_dir, exist_ok=True)

        json_path = os.path.join(self.save_dir, "report.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f"[ReportGenerator] JSON saved to {json_path}")

        md_path = os.path.join(self.save_dir, "report.md")
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(f"# {report.get('report_title', self.report_title)}\n")
            subtitle = str(report.get("subtitle", "")).strip()
            if subtitle:
                f.write(f"> {subtitle}\n\n")
            f.write(f"- 日期：{self.run_date}\n")
            f.write(
                f"- 覆盖来源："
                f"{', '.join(f'{name}({count})' for name, count in report.get('metadata', {}).get('source_counts', {}).items())}\n\n"
            )

            opening = str(report.get("opening", "")).strip()
            if opening:
                f.write("## 今日主线\n\n")
                f.write(opening + "\n\n")

            themes = report.get("themes") or []
            for index, theme in enumerate(themes, 1):
                f.write(f"### {index}. {theme.get('title', 'Untitled')}\n\n")
                f.write(str(theme.get("narrative", "")).strip() + "\n\n")
                signals = theme.get("signals") or []
                if signals:
                    f.write("关键信号：\n")
                    for signal in signals:
                        title = signal.get("title", "Untitled")
                        url = signal.get("url", "")
                        why = signal.get("why_it_matters", "")
                        source = signal.get("source", "")
                        if url:
                            f.write(f"- [{source}] [{title}]({url})：{why}\n")
                        else:
                            f.write(f"- [{source}] {title}：{why}\n")
                    f.write("\n")

            interpretation = report.get("interpretation") or {}
            thesis = str(interpretation.get("thesis", "")).strip()
            implications = str(interpretation.get("implications", "")).strip()
            if thesis or implications:
                f.write("## 我的判断\n\n")
                if thesis:
                    f.write(thesis + "\n\n")
                if implications:
                    f.write(implications + "\n\n")

            predictions = report.get("predictions") or []
            if predictions:
                f.write("## 短期预测\n\n")
                for prediction in predictions:
                    f.write(
                        f"- **{prediction.get('prediction', '')}**"
                        f"（时间：{prediction.get('time_horizon', '未注明')}，"
                        f"置信度：{prediction.get('confidence', '未注明')}）"
                        f"：{prediction.get('rationale', '')}\n"
                    )
                f.write("\n")

            ideas = report.get("ideas") or []
            if ideas:
                f.write("## 可行动的想法\n\n")
                for idea in ideas:
                    f.write(f"### {idea.get('title', 'Untitled')}\n")
                    if idea.get("detail"):
                        f.write(f"{idea.get('detail')}\n\n")
                    if idea.get("why_now"):
                        f.write(f"- 为什么是现在：{idea.get('why_now')}\n\n")

            watchlist = report.get("watchlist") or []
            if watchlist:
                f.write("## 继续跟踪\n\n")
                for watch in watchlist:
                    f.write(f"- **{watch.get('item', '')}**：{watch.get('reason', '')}\n")
                f.write("\n")
        print(f"[ReportGenerator] Markdown saved to {md_path}")

    def send_email(self, report: dict[str, Any], email_config: EmailConfig):
        html = self.render_email(report)
        BaseSource._send_email_html(html, email_config, self.report_title, self.run_datetime)
