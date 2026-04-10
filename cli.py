"""iDeer CLI — thin wrapper around main.py and agent_bridge.py.

Installed via `pip install ideer`, provides the `ideer` command with
subcommands. Does NOT replace the original `python main.py` workflow.

Usage:
    ideer run --sources arxiv huggingface --save
    ideer init
    ideer fetch arxiv --max 10
    ideer clean --dry-run
    ideer clean fetch eval --before 2026-04-01
    ideer serve
"""

import argparse
import os
import sys
import shutil
from pathlib import Path


def _find_project_dir() -> Path:
    """Find the iDeer project directory.

    Priority:
    1. IDEER_PROJECT_DIR env var
    2. Current directory (if it contains main.py + sources/)
    3. ~/.ideer/ (created by `ideer init`)
    """
    env_dir = os.environ.get("IDEER_PROJECT_DIR")
    if env_dir:
        p = Path(env_dir)
        if p.exists():
            return p

    cwd = Path.cwd()
    if (cwd / "main.py").exists() and (cwd / "sources").is_dir():
        return cwd

    home_dir = Path.home() / ".ideer"
    if home_dir.exists():
        return home_dir

    return cwd


def _ensure_project_dir_on_path(project_dir: Path):
    """Add project dir to sys.path so imports work."""
    dir_str = str(project_dir)
    if dir_str not in sys.path:
        sys.path.insert(0, dir_str)
    os.chdir(dir_str)


def _get_package_source_dir() -> Path | None:
    """Get the directory where this package's source files live."""
    cli_path = Path(__file__).resolve().parent
    if (cli_path / "main.py").exists() and (cli_path / "sources").is_dir():
        return cli_path
    return None


# ---------------------------------------------------------------------------
# Subcommands
# ---------------------------------------------------------------------------

def cmd_init(args):
    """Initialize an iDeer workspace in the current directory or ~/.ideer/."""
    target = Path(args.dir).expanduser().resolve()
    target.mkdir(parents=True, exist_ok=True)

    src = _get_package_source_dir()

    # Create profiles/
    profiles_dir = target / "profiles"
    profiles_dir.mkdir(exist_ok=True)

    desc_file = profiles_dir / "description.txt"
    if not desc_file.exists():
        desc_file.write_text(
            "I am working on the research area of artificial intelligence.\n"
            "Specifically, I am interested in the following fields:\n"
            "1. Agent - LLM-based agents, tool use, multi-step reasoning\n"
            "2. Safety - AI safety, alignment, jailbreak, red-teaming\n"
            "\n"
            "I'm not interested in the following fields:\n"
            "\n"
            "IMPORTANT: When generating the summary, please organize the content "
            "BY EACH of my interest directions above.\n",
            encoding="utf-8",
        )
        print(f"Created {desc_file}")

    profile_file = profiles_dir / "researcher_profile.md"
    if not profile_file.exists():
        profile_file.write_text("# Researcher Profile\n\nEdit this file with your research details.\n", encoding="utf-8")
        print(f"Created {profile_file}")

    # Copy .env.example → .env
    env_file = target / ".env"
    if not env_file.exists():
        if src and (src / ".env.example").exists():
            shutil.copy2(src / ".env.example", env_file)
        else:
            env_file.write_text(
                "# iDeer configuration\n"
                "PROVIDER=openai\n"
                "MODEL_NAME=\n"
                "BASE_URL=\n"
                "API_KEY=\n"
                "TEMPERATURE=0.5\n",
                encoding="utf-8",
            )
        print(f"Created {env_file}")
        print("  → Edit .env to set MODEL_NAME, BASE_URL, API_KEY")

    print(f"\niDeer workspace initialized at {target}")
    print(f"Set IDEER_PROJECT_DIR={target} or cd into it to use.")


def cmd_run(args):
    """Run the daily recommender pipeline (delegates to main.py)."""
    project_dir = _find_project_dir()
    _ensure_project_dir_on_path(project_dir)

    # Build sys.argv for main.py
    argv = []
    if args.sources:
        argv.extend(["--sources"] + args.sources)
    if args.save:
        argv.append("--save")
    if args.skip_source_emails:
        argv.append("--skip_source_emails")
    if args.generate_ideas:
        argv.append("--generate_ideas")
    if args.generate_report:
        argv.append("--generate_report")
    if args.send_report_email:
        argv.append("--send_report_email")

    # Pass through any extra args
    argv.extend(args.extra)

    sys.argv = ["main.py"] + argv
    from main import main
    main()


def cmd_fetch(args):
    """Fetch items from a source (delegates to agent_bridge.py fetch)."""
    project_dir = _find_project_dir()
    _ensure_project_dir_on_path(project_dir)

    argv = ["agent_bridge.py", "fetch", args.source]
    if args.categories:
        argv.extend(["--categories"] + args.categories)
    if args.max:
        argv.extend(["--max", str(args.max)])
    if args.queries:
        argv.extend(["--queries"] + args.queries)
    if args.content_type:
        argv.extend(["--content_type"] + args.content_type)

    sys.argv = argv
    from agent_bridge import main
    main()


def cmd_clean(args):
    """Clean caches and/or history (delegates to agent_bridge.py cache-clean)."""
    project_dir = _find_project_dir()
    _ensure_project_dir_on_path(project_dir)

    argv = ["agent_bridge.py", "cache-clean"]
    if args.target:
        argv.extend(args.target)
    if args.before:
        argv.extend(["--before", args.before])
    if args.dry_run:
        argv.append("--dry-run")

    sys.argv = argv
    from agent_bridge import main
    main()


def cmd_serve(args):
    """Start the web server (delegates to web_server.py)."""
    project_dir = _find_project_dir()
    _ensure_project_dir_on_path(project_dir)

    port = args.port or os.environ.get("PORT", "8090")
    os.environ.setdefault("PORT", str(port))

    print(f"Starting iDeer web server on port {port}...")
    import uvicorn
    from web_server import app
    uvicorn.run(app, host="0.0.0.0", port=int(port))


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        prog="ideer",
        description="🦌 iDeer — daily research digest, your way",
    )
    sub = parser.add_subparsers(dest="command", help="Available commands")

    # --- init ---
    p_init = sub.add_parser("init", help="Initialize an iDeer workspace")
    p_init.add_argument("--dir", type=str, default=".", help="Target directory (default: current)")

    # --- run ---
    p_run = sub.add_parser("run", help="Run the daily recommender pipeline")
    p_run.add_argument("--sources", nargs="+",
                       choices=["github", "huggingface", "twitter", "arxiv", "semanticscholar"],
                       help="Information sources to run")
    p_run.add_argument("--save", action="store_true", default=True, help="Save results to history (default: true)")
    p_run.add_argument("--no-save", dest="save", action="store_false", help="Don't save results")
    p_run.add_argument("--skip-source-emails", dest="skip_source_emails", action="store_true",
                       help="Skip per-source emails")
    p_run.add_argument("--ideas", dest="generate_ideas", action="store_true", help="Generate research ideas")
    p_run.add_argument("--report", dest="generate_report", action="store_true", help="Generate cross-source report")
    p_run.add_argument("--send-report", dest="send_report_email", action="store_true", help="Send report email")
    p_run.add_argument("extra", nargs=argparse.REMAINDER, help="Additional args passed to main.py")

    # --- fetch ---
    p_fetch = sub.add_parser("fetch", help="Fetch items from a source (JSON to stdout)")
    p_fetch.add_argument("source", choices=["arxiv", "huggingface", "github", "semanticscholar", "twitter"])
    p_fetch.add_argument("--categories", nargs="+", default=None)
    p_fetch.add_argument("--max", type=int, default=30)
    p_fetch.add_argument("--queries", nargs="+", default=None)
    p_fetch.add_argument("--content-type", dest="content_type", nargs="+", default=None)

    # --- clean ---
    p_clean = sub.add_parser("clean", help="Clear caches and/or history")
    p_clean.add_argument("target", nargs="*", default=["all"],
                         help="What to clean: all, fetch, eval, history, ideas, reports")
    p_clean.add_argument("--before", type=str, default=None, help="Only clean entries older than YYYY-MM-DD")
    p_clean.add_argument("--dry-run", action="store_true", help="Preview without deleting")

    # --- serve ---
    p_serve = sub.add_parser("serve", help="Start the web UI server")
    p_serve.add_argument("--port", type=int, default=None, help="Server port (default: 8090)")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    cmd_map = {
        "init": cmd_init,
        "run": cmd_run,
        "fetch": cmd_fetch,
        "clean": cmd_clean,
        "serve": cmd_serve,
    }
    cmd_map[args.command](args)


if __name__ == "__main__":
    main()
