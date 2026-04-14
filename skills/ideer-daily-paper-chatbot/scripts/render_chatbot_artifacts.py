#!/usr/bin/env python3
"""Render chatbot-first test artifacts into HTML without depending on repo code."""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path


FRAMEWORK = """
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: Arial, "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2937; margin: 0; background: #f8fafc; }
    .page { max-width: 960px; margin: 0 auto; padding: 28px 20px 40px; }
    .hero { margin-bottom: 28px; }
    .hero h1 { font-size: 32px; margin: 0; color: #0f172a; }
    .hero p { margin: 10px 0 0; color: #475569; line-height: 1.7; }
    .section-title { font-size: 24px; font-weight: 800; margin: 28px 0 14px; color: #0f172a; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
    .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 18px 20px; margin: 14px 0; box-shadow: 0 8px 24px rgba(15,23,42,0.04); }
    .card h3 { margin: 0; font-size: 18px; color: #0f172a; }
    .meta { margin-top: 8px; font-size: 12px; color: #64748b; }
    .body { margin-top: 10px; font-size: 14px; line-height: 1.8; color: #334155; }
    .body p { margin: 10px 0; }
    .pill { display: inline-block; padding: 3px 8px; border-radius: 999px; background: #eef2ff; color: #3730a3; font-size: 12px; font-weight: 700; margin-right: 8px; }
    ul { margin: 10px 0 10px 20px; padding: 0; }
    li { margin: 8px 0; line-height: 1.75; }
    a { color: #0f172a; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background: #f1f5f9; padding: 1px 5px; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="page">
    __CONTENT__
  </div>
</body>
</html>
"""


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _write(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def _inline(text: str) -> str:
    escaped = html.escape(text, quote=True)
    escaped = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"`(.+?)`", r"<code>\1</code>", escaped)
    return escaped


def parse_digest_items(md_text: str) -> list[dict]:
    items: list[dict] = []
    current: dict | None = None
    for raw in md_text.splitlines():
        line = raw.strip()
        if line.startswith("### "):
            if current:
                items.append(current)
            current = {"title": re.sub(r"^\d+\.\s+", "", line[4:].strip())}
        elif current and line.startswith("- "):
            m = re.match(r"-\s+(.+?):\s*(.*)", line)
            if m:
                key = m.group(1).strip().lower().replace(" ", "_")
                current[key] = m.group(2).strip()
    if current:
        items.append(current)
    return items


def parse_direction_sections(md_text: str) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {}
    current: str | None = None
    for raw in md_text.splitlines():
        line = raw.strip()
        if line.startswith("### ") and "Top Picks" not in line:
            current = line[4:].strip()
            sections.setdefault(current, [])
        elif current and line and not line.startswith("#") and not line.startswith("- "):
            sections[current].append(line)
    return {k: v for k, v in sections.items() if v}


def render_digest_email(date_str: str, items: list[dict]) -> str:
    cards: list[str] = []
    for item in items:
        title = html.escape(item.get("title", "Untitled"))
        link = html.escape(item.get("link", ""))
        source = html.escape(item.get("source", ""))
        relevance = html.escape(item.get("relevance", ""))
        summary = html.escape(item.get("summary", ""))
        why = html.escape(item.get("why_it_matters", ""))
        meta = " · ".join(part for part in [source, relevance] if part)
        cards.append(
            f"""
            <div class="card">
              <h3><a href="{link}">{title}</a></h3>
              <div class="meta">{meta}</div>
              <div class="body"><p>{summary}</p></div>
              <div class="body"><p><strong>Why it matters:</strong> {why}</p></div>
            </div>
            """
        )
    content = f"""
      <div class="hero">
        <h1>Daily Paper Digest</h1>
        <p>日期：{html.escape(date_str)} · 模式：chatbot-first skill test</p>
      </div>
      <div class="section-title">Top Picks</div>
      {''.join(cards)}
    """
    return FRAMEWORK.replace("__CONTENT__", content)


def render_report_html(date_str: str, digest_md: str, ideas: list[dict]) -> str:
    items = parse_digest_items(digest_md)
    sections = parse_direction_sections(digest_md)
    cards = "".join(
        f"""
        <div class="card">
          <h3><a href="{html.escape(item.get('link', ''))}">{html.escape(item.get('title', 'Untitled'))}</a></h3>
          <div class="meta">{html.escape(item.get('source', ''))} · {html.escape(item.get('relevance', ''))}</div>
          <div class="body"><p>{html.escape(item.get('summary', ''))}</p></div>
          <div class="body"><p><strong>Why it matters:</strong> {html.escape(item.get('why_it_matters', ''))}</p></div>
        </div>
        """
        for item in items
    )
    section_html = "".join(
        f"""
        <div class="section-title">{html.escape(name)}</div>
        <div class="card">
          {''.join(f"<div class='body'><p>{html.escape(p)}</p></div>" for p in paras)}
        </div>
        """
        for name, paras in sections.items()
    )
    ideas_html = "".join(
        f"""
        <div class="card">
          <h3>{html.escape(idea.get('title', 'Untitled'))}</h3>
          <div class="body"><p><strong>Motivation:</strong> {html.escape(idea.get('motivation', ''))}</p></div>
          <div class="body"><p><strong>Hypothesis:</strong> {html.escape(idea.get('hypothesis', ''))}</p></div>
          <div class="body"><p><strong>Direction:</strong> {html.escape(idea.get('concrete_direction', ''))}</p></div>
        </div>
        """
        for idea in ideas
    )
    content = f"""
      <div class="hero">
        <h1>Daily Personal Briefing</h1>
        <p>日期：{html.escape(date_str)} · 模式：chatbot-first skill test</p>
      </div>
      <div class="section-title">Top Picks</div>
      {cards}
      {section_html}
      <div class="section-title">Research Ideas</div>
      {ideas_html}
    """
    return FRAMEWORK.replace("__CONTENT__", content)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True)
    parser.add_argument("--base-dir", required=True, help="Directory containing test_digest.md and test_ideas.json")
    args = parser.parse_args()

    base_dir = Path(args.base_dir).resolve()
    digest_md_path = base_dir / "test_digest.md"
    ideas_json_path = base_dir / "test_ideas.json"
    report_html_path = base_dir / "report.html"
    digest_email_path = base_dir / "digest_email.html"

    digest_md = _read(digest_md_path)
    ideas = json.loads(_read(ideas_json_path))
    items = parse_digest_items(digest_md)

    _write(report_html_path, render_report_html(args.date, digest_md, ideas))
    _write(digest_email_path, render_digest_email(args.date, items))

    print(report_html_path)
    print(digest_email_path)


if __name__ == "__main__":
    main()
