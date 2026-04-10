"""Agent bridge: utilities for agent-driven (no LLM API) pipeline.

The agent (Claude/Codex) acts as the LLM itself — it reads items, scores
them, writes summaries. This module provides the I/O plumbing:
  - save scored items to history/
  - render and send email from pre-built HTML
  - save ideas to history/ideas/
"""

import argparse
import json
import os
import sys
import smtplib
from datetime import datetime, timezone
from email.header import Header
from email.mime.text import MIMEText
from email.utils import parseaddr, formataddr
from pathlib import Path


def load_dotenv(path: str = ".env") -> None:
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip()
            if key.startswith("export "):
                key = key[len("export "):].strip()
            if value and value[0] == value[-1] and value[0] in ("'", '"'):
                value = value[1:-1]
            os.environ.setdefault(key, value)


def send_email_html(html: str, subject: str) -> bool:
    """Send an HTML email using SMTP config from environment."""
    load_dotenv()
    smtp_server = os.getenv("SMTP_SERVER", "")
    smtp_port = int(os.getenv("SMTP_PORT", "465"))
    sender = os.getenv("SMTP_SENDER", "")
    receiver = os.getenv("SMTP_RECEIVER", "")
    password = os.getenv("SMTP_PASSWORD", "")

    if not all([smtp_server, sender, receiver, password]):
        print("Email not sent: incomplete SMTP config in .env")
        return False

    def _format_addr(s):
        name, addr = parseaddr(s)
        return formataddr((Header(name, "utf-8").encode(), addr))

    msg = MIMEText(html, "html", "utf-8")
    msg["From"] = _format_addr(f"iDeer <{sender}>")
    receivers = [addr.strip() for addr in receiver.split(",")]
    msg["To"] = ",".join([_format_addr(f"You <{addr}>") for addr in receivers])
    msg["Subject"] = Header(subject, "utf-8").encode()

    try:
        if smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_server, smtp_port, timeout=20)
        else:
            server = smtplib.SMTP(smtp_server, smtp_port, timeout=20)
            server.ehlo()
            server.starttls()
            server.ehlo()
    except Exception as e:
        print(f"SMTP connection failed: {e}")
        return False

    try:
        server.login(sender, password)
        server.sendmail(sender, receivers, msg.as_string())
        server.quit()
        print(f"Email sent to {receivers}")
        return True
    except Exception as e:
        print(f"Email send failed: {e}")
        return False


def save_items(source: str, items: list[dict], date: str | None = None,
               save_dir: str = "./history") -> str:
    """Save scored items to history/{source}/{date}/json/ and a summary markdown."""
    date = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    base_dir = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(base_dir, save_dir, source, date)
    json_dir = os.path.join(out_dir, "json")
    os.makedirs(json_dir, exist_ok=True)

    # Save individual items
    for item in items:
        item_id = item.get("cache_id", item.get("title", "unknown"))
        safe_id = "".join(c if c.isalnum() or c in "-_" else "_" for c in str(item_id))[:80]
        path = os.path.join(json_dir, f"{safe_id}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(item, f, ensure_ascii=False, indent=2)

    # Save markdown summary
    md_path = os.path.join(out_dir, f"{date}.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(f"# {source} Recommendations\n## Date: {date}\n\n")
        for i, item in enumerate(items, 1):
            f.write(f"### {i}. {item.get('title', 'Unknown')}\n")
            f.write(f"- **Score:** {item.get('score', 0)}\n")
            f.write(f"- **Summary:** {item.get('summary', 'N/A')}\n")
            f.write(f"- **URL:** {item.get('url', '')}\n\n")

    print(f"Saved {len(items)} items to {out_dir}")
    return out_dir


def save_email_html(source: str, html: str, date: str | None = None,
                    save_dir: str = "./history") -> str:
    """Save rendered email HTML to history/{source}/{date}/."""
    date = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    base_dir = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(base_dir, save_dir, source, date)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{source}_email.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Email HTML saved to {path}")
    return path


def save_ideas(ideas: list[dict], date: str | None = None,
               save_dir: str = "./history") -> str:
    """Save research ideas to history/ideas/{date}/."""
    date = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    base_dir = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(base_dir, save_dir, "ideas", date)
    os.makedirs(out_dir, exist_ok=True)

    json_path = os.path.join(out_dir, "ideas.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(ideas, f, ensure_ascii=False, indent=2)

    md_path = os.path.join(out_dir, "ideas.md")
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(f"# Daily Research Ideas\n## Date: {date}\n\n")
        for i, idea in enumerate(ideas, 1):
            f.write(f"### Idea {i}: {idea.get('title', 'Untitled')}\n")
            f.write(f"- **Research Direction**: {idea.get('research_direction', '')}\n")
            f.write(f"- **Hypothesis**: {idea.get('hypothesis', '')}\n")
            f.write(f"- **Project**: {idea.get('connects_to_project', 'N/A')}\n")
            f.write(f"- **Novelty**: {idea.get('novelty_estimate', '')} | ")
            f.write(f"**Feasibility**: {idea.get('feasibility', '')}\n")
            f.write(f"- **Score**: {idea.get('composite_score', 0)}\n\n")

    print(f"Saved {len(ideas)} ideas to {out_dir}")
    return out_dir


def cache_clean(targets: list[str], before: str | None = None, dry_run: bool = False):
    """Clear caches and/or history data.

    targets: list of what to clean — all, fetch, eval, history, ideas, reports
    before:  only delete date-dirs older than this (YYYY-MM-DD), None = delete all
    """
    base_dir = os.path.dirname(os.path.abspath(__file__))
    target_set = set(targets)
    clean_all = "all" in target_set

    dirs_to_clean = []

    if clean_all or "fetch" in target_set:
        dirs_to_clean.append(("fetch cache", os.path.join(base_dir, "state", "fetch_cache")))
    if clean_all or "eval" in target_set:
        dirs_to_clean.append(("eval cache", os.path.join(base_dir, "state", "eval_cache")))
    if clean_all or "history" in target_set:
        for source in ["arxiv", "huggingface", "github", "semanticscholar", "twitter"]:
            dirs_to_clean.append((f"history/{source}", os.path.join(base_dir, "history", source)))
    if clean_all or "ideas" in target_set:
        dirs_to_clean.append(("history/ideas", os.path.join(base_dir, "history", "ideas")))
    if clean_all or "reports" in target_set:
        dirs_to_clean.append(("history/reports", os.path.join(base_dir, "history", "reports")))

    import shutil
    total_removed = 0

    for label, dir_path in dirs_to_clean:
        if not os.path.exists(dir_path):
            continue

        if before is None:
            # Remove entire directory
            size = _dir_size(dir_path)
            if dry_run:
                print(f"[dry-run] Would delete {label} ({_fmt_size(size)}): {dir_path}")
            else:
                shutil.rmtree(dir_path)
                print(f"Deleted {label} ({_fmt_size(size)})")
            total_removed += size
        else:
            # Only remove date subdirs older than `before`
            for entry in sorted(os.listdir(dir_path)):
                entry_path = os.path.join(dir_path, entry)
                if not os.path.isdir(entry_path):
                    continue
                # Compare lexicographically (works for YYYY-MM-DD)
                if entry < before:
                    size = _dir_size(entry_path)
                    if dry_run:
                        print(f"[dry-run] Would delete {label}/{entry} ({_fmt_size(size)})")
                    else:
                        shutil.rmtree(entry_path)
                        print(f"Deleted {label}/{entry} ({_fmt_size(size)})")
                    total_removed += size

    action = "Would free" if dry_run else "Freed"
    print(f"\n{action} {_fmt_size(total_removed)} total.")


def _dir_size(path: str) -> int:
    total = 0
    for dirpath, _, filenames in os.walk(path):
        for f in filenames:
            total += os.path.getsize(os.path.join(dirpath, f))
    return total


def _fmt_size(nbytes: int) -> str:
    if nbytes < 1024:
        return f"{nbytes} B"
    elif nbytes < 1024 * 1024:
        return f"{nbytes / 1024:.1f} KB"
    else:
        return f"{nbytes / 1024 / 1024:.1f} MB"


# ---------------------------------------------------------------------------
# CLI interface for agent to call
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Agent bridge utilities")
    sub = parser.add_subparsers(dest="command")

    # --- fetch: run a fetcher and print JSON ---
    p_fetch = sub.add_parser("fetch", help="Run a fetcher and print JSON to stdout")
    p_fetch.add_argument("source", choices=["arxiv", "huggingface", "github",
                                             "semanticscholar", "twitter"])
    p_fetch.add_argument("--categories", nargs="+", default=["cs.AI"])
    p_fetch.add_argument("--max", type=int, default=30)
    p_fetch.add_argument("--queries", nargs="+", default=[])
    p_fetch.add_argument("--language", type=str, default=None)
    p_fetch.add_argument("--since", type=str, default="daily")
    p_fetch.add_argument("--content_type", nargs="+", default=["papers"])

    # --- save-items: save scored items from stdin JSON ---
    p_save = sub.add_parser("save-items", help="Save scored items (JSON from stdin)")
    p_save.add_argument("source", type=str)
    p_save.add_argument("--date", type=str, default=None)

    # --- save-ideas: save ideas from stdin JSON ---
    p_ideas = sub.add_parser("save-ideas", help="Save ideas (JSON from stdin)")
    p_ideas.add_argument("--date", type=str, default=None)

    # --- send-email: send HTML email from stdin ---
    p_email = sub.add_parser("send-email", help="Send HTML email (HTML from stdin)")
    p_email.add_argument("--subject", type=str, default="iDeer Daily")

    # --- cache-clean: clear cache and/or history ---
    p_clean = sub.add_parser("cache-clean", help="Clear caches and/or history")
    p_clean.add_argument("target", nargs="*", default=["all"],
                         help="What to clean: all, fetch, eval, history, ideas, reports (default: all)")
    p_clean.add_argument("--before", type=str, default=None,
                         help="Only delete data older than this date (YYYY-MM-DD)")
    p_clean.add_argument("--dry-run", action="store_true",
                         help="Show what would be deleted without deleting")

    args = parser.parse_args()

    if args.command == "fetch":
        # Redirect stdout to stderr during fetching so print() logs don't
        # corrupt the JSON output.
        real_stdout = sys.stdout
        sys.stdout = sys.stderr
        items = _run_fetcher(args)
        sys.stdout = real_stdout
        json.dump(items, real_stdout, ensure_ascii=False, indent=2)

    elif args.command == "save-items":
        items = json.load(sys.stdin)
        save_items(args.source, items, date=args.date)

    elif args.command == "save-ideas":
        ideas = json.load(sys.stdin)
        save_ideas(ideas, date=args.date)

    elif args.command == "send-email":
        html = sys.stdin.read()
        send_email_html(html, args.subject)

    elif args.command == "cache-clean":
        cache_clean(args.target, before=args.before, dry_run=args.dry_run)

    else:
        parser.print_help()


def _run_fetcher(args) -> list:
    if args.source == "arxiv":
        from fetchers.arxiv_fetcher import fetch_papers_for_categories
        by_cat = fetch_papers_for_categories(args.categories, max_entries=args.max)
        items = []
        for cat, papers in by_cat.items():
            for p in papers:
                p["_category"] = cat
                items.append(p)
        return items

    elif args.source == "huggingface":
        from fetchers.huggingface_fetcher import get_daily_papers, get_trending_models_api
        items = []
        if "papers" in args.content_type:
            items.extend(get_daily_papers(args.max))
        if "models" in args.content_type:
            items.extend(get_trending_models_api(args.max))
        return items

    elif args.source == "github":
        from fetchers.github_fetcher import get_trending_repos
        return get_trending_repos(language=args.language, since=args.since,
                                  max_results=args.max)

    elif args.source == "semanticscholar":
        from fetchers.semanticscholar_fetcher import fetch_papers_for_queries
        queries = args.queries or ["artificial intelligence"]
        return fetch_papers_for_queries(queries, max_results_per_query=args.max)

    elif args.source == "twitter":
        print("Twitter requires API key — use fetchers/twitter_fetcher.py directly",
              file=sys.stderr)
        return []

    return []


if __name__ == "__main__":
    main()
