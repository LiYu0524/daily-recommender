#!/usr/bin/env python3
from __future__ import annotations

import os
import shlex
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
PROFILES_DIR = REPO_ROOT / "profiles"
ENV_PATH = REPO_ROOT / ".env"


def read_env(name: str, default: str = "") -> str:
    value = os.getenv(name, default)
    return value.strip() if isinstance(value, str) else default


def read_secret(name: str, missing: list[str]) -> str:
    value = os.getenv(name, "")
    if not str(value).strip():
        missing.append(name)
    return str(value)


def bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def write_text(path: Path, content: str) -> None:
    normalized = content.rstrip("\n")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(normalized + "\n", encoding="utf-8")


def main() -> int:
    missing: list[str] = []

    model_name = read_secret("IDEER_MODEL_NAME", missing)
    base_url = read_secret("IDEER_BASE_URL", missing)
    api_key = read_secret("IDEER_API_KEY", missing)
    smtp_server = read_secret("IDEER_SMTP_SERVER", missing)
    smtp_port = read_secret("IDEER_SMTP_PORT", missing)
    smtp_sender = read_secret("IDEER_SMTP_SENDER", missing)
    smtp_receiver = read_env("INPUT_RECEIVER") or read_secret("IDEER_SMTP_RECEIVER", missing)
    smtp_password = read_secret("IDEER_SMTP_PASSWORD", missing)
    description_text = read_secret("IDEER_DESCRIPTION_TEXT", missing)

    if missing:
        print(
            "Missing required GitHub Actions secrets: " + ", ".join(sorted(set(missing))),
            file=sys.stderr,
        )
        return 1

    provider = read_env("IDEER_PROVIDER", "openai")
    temperature = read_env("IDEER_TEMPERATURE", "0.5")
    daily_sources = read_env("INPUT_SOURCES") or read_env(
        "IDEER_DAILY_SOURCES",
        "github arxiv semanticscholar huggingface",
    )
    report_title = read_env("INPUT_REPORT_TITLE") or read_env(
        "IDEER_REPORT_TITLE",
        "Daily Personal Briefing",
    )
    send_report_email = bool_env("INPUT_SEND_EMAIL", True)

    PROFILES_DIR.mkdir(parents=True, exist_ok=True)
    (REPO_ROOT / "history").mkdir(parents=True, exist_ok=True)
    (REPO_ROOT / "state").mkdir(parents=True, exist_ok=True)

    write_text(PROFILES_DIR / "description.txt", description_text)

    researcher_profile = os.getenv("IDEER_RESEARCHER_PROFILE_TEXT", "")
    report_profile_file = ""
    if researcher_profile.strip():
        write_text(PROFILES_DIR / "researcher_profile.md", researcher_profile)
        report_profile_file = "profiles/researcher_profile.md"

    x_accounts = os.getenv("IDEER_X_ACCOUNTS", "")
    if x_accounts.strip():
        write_text(PROFILES_DIR / "x_accounts.txt", x_accounts)

    env_map: dict[str, str] = {
        "PROVIDER": provider,
        "MODEL_NAME": model_name,
        "BASE_URL": base_url,
        "API_KEY": api_key,
        "TEMPERATURE": temperature,
        "SMTP_SERVER": smtp_server,
        "SMTP_PORT": smtp_port,
        "SMTP_SENDER": smtp_sender,
        "SMTP_RECEIVER": smtp_receiver,
        "SMTP_PASSWORD": smtp_password,
        "DESCRIPTION_FILE": "profiles/description.txt",
        "DAILY_SOURCES": daily_sources,
        "NUM_WORKERS": read_env("IDEER_NUM_WORKERS", "6"),
        "GENERATE_REPORT": "1",
        "SEND_REPORT_EMAIL": "1" if send_report_email else "0",
        "SKIP_SOURCE_EMAILS": "1",
        "REPORT_TITLE": report_title,
        "REPORT_MIN_SCORE": read_env("IDEER_REPORT_MIN_SCORE", "4.0"),
        "REPORT_MAX_ITEMS": read_env("IDEER_REPORT_MAX_ITEMS", "18"),
        "REPORT_THEME_COUNT": read_env("IDEER_REPORT_THEME_COUNT", "4"),
        "REPORT_PREDICTION_COUNT": read_env("IDEER_REPORT_PREDICTION_COUNT", "4"),
        "REPORT_IDEA_COUNT": read_env("IDEER_REPORT_IDEA_COUNT", "4"),
        "ARXIV_CATEGORIES": read_env("IDEER_ARXIV_CATEGORIES", "cs.AI cs.CL cs.LG"),
        "ARXIV_MAX_ENTRIES": read_env("IDEER_ARXIV_MAX_ENTRIES", "100"),
        "ARXIV_MAX_PAPERS": read_env("IDEER_ARXIV_MAX_PAPERS", "60"),
        "GH_LANGUAGES": read_env("IDEER_GH_LANGUAGES", "all"),
        "GH_SINCE": read_env("IDEER_GH_SINCE", "daily"),
        "GH_MAX_REPOS": read_env("IDEER_GH_MAX_REPOS", "30"),
        "HF_CONTENT_TYPES": read_env("IDEER_HF_CONTENT_TYPES", "papers"),
        "HF_MAX_PAPERS": read_env("IDEER_HF_MAX_PAPERS", "30"),
        "HF_MAX_MODELS": read_env("IDEER_HF_MAX_MODELS", "15"),
        "SS_QUERIES": read_env("IDEER_SS_QUERIES", ""),
        "SS_MAX_RESULTS": read_env("IDEER_SS_MAX_RESULTS", "60"),
        "SS_MAX_PAPERS": read_env("IDEER_SS_MAX_PAPERS", "30"),
        "SS_YEAR": read_env("IDEER_SS_YEAR", ""),
        "SS_FIELDS_OF_STUDY": read_env("IDEER_SS_FIELDS_OF_STUDY", "Computer Science"),
        "SS_API_KEY": read_env("IDEER_SS_API_KEY", ""),
        "X_RAPIDAPI_KEY": read_env("IDEER_X_RAPIDAPI_KEY", ""),
        "X_RAPIDAPI_HOST": read_env("IDEER_X_RAPIDAPI_HOST", "twitter-api45.p.rapidapi.com"),
        "X_ACCOUNTS_FILE": "profiles/x_accounts.txt",
        "X_DISCOVER_ACCOUNTS": read_env("IDEER_X_DISCOVER_ACCOUNTS", "0"),
        "X_MERGE_STATIC_ACCOUNTS": read_env("IDEER_X_MERGE_STATIC_ACCOUNTS", "0"),
        "X_USE_PERSISTED_ACCOUNTS": read_env("IDEER_X_USE_PERSISTED_ACCOUNTS", "0"),
        "X_SKIP_DISCOVERY_IF_PERSISTED": read_env("IDEER_X_SKIP_DISCOVERY_IF_PERSISTED", "1"),
        "X_DISCOVERY_PERSIST_FILE": read_env(
            "IDEER_X_DISCOVERY_PERSIST_FILE",
            "state/x_accounts.discovered.txt",
        ),
    }

    if report_profile_file:
        env_map["REPORT_PROFILE_FILE"] = report_profile_file

    lines = [f"{key}={shlex.quote(str(value))}" for key, value in env_map.items()]
    ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print("Wrote GitHub Actions runtime files:")
    print(f"- {ENV_PATH}")
    print(f"- {PROFILES_DIR / 'description.txt'}")
    if report_profile_file:
        print(f"- {PROFILES_DIR / 'researcher_profile.md'}")
    if x_accounts.strip():
        print(f"- {PROFILES_DIR / 'x_accounts.txt'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
