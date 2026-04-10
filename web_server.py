"""
Daily Recommender Web Backend
FastAPI + WebSocket 实时日志
"""

from __future__ import annotations

import asyncio
import json
import locale
import mimetypes
import os
import re
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from fetchers.profile_fetcher import build_profile_text_from_urls


# 项目根目录
PROJECT_ROOT = Path(__file__).parent.absolute()
HISTORY_DIR = PROJECT_ROOT / "history"
CONFIG_FILE = PROJECT_ROOT / ".web_config.json"
CLIENT_CONFIG_FILE = PROJECT_ROOT / ".client_config.json"
ENV_FILE = PROJECT_ROOT / ".env"
PUBLIC_UI_FILE = PROJECT_ROOT / "public-web-ui.html"
ADMIN_UI_FILE = PROJECT_ROOT / "web-ui.html"
DESKTOP_UI_FILE = PROJECT_ROOT / "desktop-ui.html"
CLIENT_DIST_DIR = PROJECT_ROOT / "client" / "dist"
CLIENT_DIST_INDEX_FILE = CLIENT_DIST_DIR / "index.html"
DESCRIPTION_FILE = PROJECT_ROOT / "profiles" / "description.txt"
RESEARCHER_PROFILE_FILE = PROJECT_ROOT / "profiles" / "researcher_profile.md"
USER_RESEARCHER_PROFILE_FILE = PROJECT_ROOT / "profiles" / "user_researcher_profile.md"
LEGACY_USER_RESEARCHER_PROFILE_FILE = PROJECT_ROOT / "profiles" / "reseracher_profile.txt"
TWITTER_ACCOUNTS_FILE = PROJECT_ROOT / "profiles" / "x_accounts.txt"
SWIPE_FEEDBACK_FILE = PROJECT_ROOT / "profiles" / "swipe_feedback.json"
GITHUB_REPO_URL = "https://github.com/LiYu0524/daily-recommender"
VISIBLE_SOURCE_KEYS = ["github", "huggingface", "twitter", "arxiv", "wos", "cnki", "wechat", "scholar"]
DEFAULT_VISIBLE_SOURCES = ["github", "huggingface", "arxiv"]

DEFAULT_CONFIG = {
    "desktop_python_path": "",
    "profile_name": "",
    "profile_avatar": "1",
    "onboarding_completed": False,
    "model_mode": "custom",
    "smtp_mode": "custom",
    "provider": "openai",
    "model": "gpt-4o-mini",
    "base_url": "",
    "api_key": "",
    "temperature": 0.5,
    "smtp_server": "",
    "smtp_port": 465,
    "sender": "",
    "receiver": "",
    "smtp_password": "",
    "gh_languages": "all",
    "gh_since": "daily",
    "gh_max_repos": 30,
    "hf_content_types": ["papers", "models"],
    "hf_max_papers": 30,
    "hf_max_models": 15,
    "description": "",
    "researcher_profile": "",
    "user_researcher_profile": "",
    "x_rapidapi_key": "",
    "x_rapidapi_host": "twitter-api45.p.rapidapi.com",
    "x_accounts": "",
    "arxiv_categories": "cs.AI",
    "arxiv_max_entries": 100,
    "arxiv_max_papers": 60,
    "log_level": "standard",
    "visible_sources": list(DEFAULT_VISIBLE_SOURCES),
    "ss_max_results": 60,
    "ss_max_papers": 30,
    "ss_year": "",
    "ss_api_key": "",
    "schedule_enabled": False,
    "schedule_frequency": "daily",
    "schedule_time": "08:00",
    "schedule_sources": [],
    "schedule_generate_report": False,
    "schedule_generate_ideas": False,
}

MANAGED_SMTP_CONFIG = {
    "smtp_server": "smtp.163.com",
    "smtp_port": 465,
    "sender": "boming8036881@163.com",
    "smtp_password": "PSBggDPXAhQVeqx7",
}

app = FastAPI(title="Daily Recommender API", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _read_text_if_exists(path: Path) -> str:
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    return ""


def _decode_process_line(raw: bytes) -> str:
    preferred = locale.getpreferredencoding(False) or "utf-8"
    tried: list[str] = []
    for encoding in (preferred, "utf-8", "gbk", "cp936"):
        normalized = encoding.lower()
        if normalized in tried:
            continue
        tried.append(normalized)
        try:
            return raw.decode(encoding).rstrip()
        except UnicodeDecodeError:
            continue
    return raw.decode(preferred, errors="replace").rstrip()


def _normalize_multiline_text(value: str) -> str:
    lines = [line.rstrip() for line in str(value or "").replace("\r\n", "\n").split("\n")]
    return "\n".join(lines).strip()


def _load_env_fallbacks() -> dict:
    if not ENV_FILE.exists():
        return {}

    raw_values: dict[str, str] = {}
    for raw_line in ENV_FILE.read_text(encoding="utf-8").splitlines():
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
        raw_values[key] = value

    fallback: dict[str, object] = {}
    mapping = {
        "desktop_python_path": "DESKTOP_PYTHON_PATH",
        "provider": "PROVIDER",
        "model": "MODEL_NAME",
        "base_url": "BASE_URL",
        "api_key": "API_KEY",
        "log_level": "LOG_LEVEL",
        "smtp_server": "SMTP_SERVER",
        "sender": "SMTP_SENDER",
        "receiver": "SMTP_RECEIVER",
        "smtp_password": "SMTP_PASSWORD",
        "gh_languages": "GH_LANGUAGES",
        "gh_since": "GH_SINCE",
        "gh_max_repos": "GH_MAX_REPOS",
        "hf_max_papers": "HF_MAX_PAPERS",
        "hf_max_models": "HF_MAX_MODELS",
        "x_rapidapi_key": "X_RAPIDAPI_KEY",
        "x_rapidapi_host": "X_RAPIDAPI_HOST",
    }
    for config_key, env_key in mapping.items():
        value = raw_values.get(env_key, "")
        if value:
            fallback[config_key] = value

    if raw_values.get("TEMPERATURE"):
        fallback["temperature"] = float(raw_values["TEMPERATURE"])
    if raw_values.get("SMTP_PORT"):
        fallback["smtp_port"] = int(raw_values["SMTP_PORT"])
    if raw_values.get("GH_MAX_REPOS"):
        fallback["gh_max_repos"] = int(raw_values["GH_MAX_REPOS"])
    if raw_values.get("HF_MAX_PAPERS"):
        fallback["hf_max_papers"] = int(raw_values["HF_MAX_PAPERS"])
    if raw_values.get("HF_MAX_MODELS"):
        fallback["hf_max_models"] = int(raw_values["HF_MAX_MODELS"])
    if raw_values.get("HF_CONTENT_TYPES"):
        fallback["hf_content_types"] = [item for item in raw_values["HF_CONTENT_TYPES"].split() if item]

    return fallback


def load_config_data() -> dict:
    config = dict(DEFAULT_CONFIG)
    env_fallbacks = _load_env_fallbacks()
    config.update(env_fallbacks)

    for config_file in (CONFIG_FILE, CLIENT_CONFIG_FILE):
        if config_file.exists():
            content = config_file.read_text(encoding="utf-8").strip()
            if content:
                config.update(json.loads(content))

    # File-backed values are used as fallback only when the JSON config
    # does not already contain a non-empty value for the key.  Previously
    # they unconditionally overwrote the JSON config, which caused the
    # saved description to be ignored if the file still held old content.
    file_backed_values = {
        "description": _read_text_if_exists(DESCRIPTION_FILE),
        "researcher_profile": _read_text_if_exists(RESEARCHER_PROFILE_FILE),
        "user_researcher_profile": _read_text_if_exists(USER_RESEARCHER_PROFILE_FILE) or _read_text_if_exists(LEGACY_USER_RESEARCHER_PROFILE_FILE),
        "x_accounts": _read_text_if_exists(TWITTER_ACCOUNTS_FILE),
    }
    for key, value in file_backed_values.items():
        if value and not config.get(key):
            config[key] = value

    if not config.get("hf_content_types"):
        config["hf_content_types"] = ["papers", "models"]
    if not config.get("x_rapidapi_host"):
        config["x_rapidapi_host"] = DEFAULT_CONFIG["x_rapidapi_host"]
    config["log_level"] = _normalize_log_level(config.get("log_level", "standard"))
    config["visible_sources"] = _normalize_visible_sources(config.get("visible_sources"))

    return config


def resolve_smtp_config(config: dict) -> dict[str, object]:
    mode = str(config.get("smtp_mode", "custom")).strip() or "custom"
    if mode == "managed":
        return dict(MANAGED_SMTP_CONFIG)
    return {
        "smtp_server": str(config.get("smtp_server", "")).strip(),
        "smtp_port": int(config.get("smtp_port", 465) or 465),
        "sender": str(config.get("sender", "")).strip(),
        "smtp_password": str(config.get("smtp_password", "")).strip(),
    }


def _write_text_file(path: Path, content: str, delete_if_empty: bool = False) -> None:
    normalized = _normalize_multiline_text(content)
    path.parent.mkdir(parents=True, exist_ok=True)
    if normalized:
        path.write_text(normalized + "\n", encoding="utf-8")
        return
    if delete_if_empty:
        if path.exists():
            path.unlink()
        return
    path.write_text("", encoding="utf-8")


def _delete_file_if_exists(path: Path) -> None:
    if path.exists():
        path.unlink()


def _build_effective_researcher_profile(
    researcher_profile: str | None,
    user_researcher_profile: str | None,
    description: str | None,
) -> str:
    explicit_profile = _normalize_multiline_text(researcher_profile)
    if explicit_profile:
        return explicit_profile

    sections: list[str] = []
    user_self = _normalize_multiline_text(user_researcher_profile)
    interests = _normalize_multiline_text(description)

    if user_self:
        sections.append(f"# Researcher Overview\n{user_self}")
    if interests:
        sections.append(f"# Interest Profile\n{interests}")

    return "\n\n".join(section for section in sections if section.strip()).strip()


def _append_arg(cmd: list[str], flag: str, value: str | int | float | None) -> None:
    if value in (None, ""):
        return
    cmd.extend([flag, str(value)])


def _normalize_log_level(value: str | None) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"progress", "standard", "verbose"}:
        return normalized
    return "standard"


def _normalize_visible_sources(value: object) -> list[str]:
    items = value if isinstance(value, list) else []
    normalized = [key for key in VISIBLE_SOURCE_KEYS if key in items]
    return normalized or list(DEFAULT_VISIBLE_SOURCES)


def _log_level_value(level: str) -> int:
    return {"progress": 0, "standard": 1, "verbose": 2}.get(_normalize_log_level(level), 1)


def _classify_process_log(text: str) -> str:
    lowered = text.lower()
    progress_markers = (
        "starting source",
        "completed with",
        "all sources completed",
        "generating cross-source report",
        "generating research ideas",
        "processing ",
        "no items fetched",
        "llm is available",
        "testing llm availability",
        "source failed",
    )
    verbose_markers = (
        "reading item:",
        "item text:",
        "summary input:",
        "using interest profile:",
        "researcher self profile:",
    )
    if any(marker in lowered for marker in verbose_markers):
        return "verbose"
    if any(marker in lowered for marker in progress_markers):
        return "progress"
    return "standard"


def _resolve_client_dist_path(relative_path: str) -> Path | None:
    if not CLIENT_DIST_DIR.exists():
        return None

    candidate = (CLIENT_DIST_DIR / relative_path).resolve()
    dist_root = CLIENT_DIST_DIR.resolve()
    if candidate != dist_root and dist_root not in candidate.parents:
        return None
    return candidate


def _merge_unique_strings(*groups: list[str]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for group in groups:
        for item in group:
            value = item.strip()
            if not value:
                continue
            key = value.lower()
            if key in seen:
                continue
            seen.add(key)
            merged.append(value)
    return merged


def _normalize_x_username(raw_value: str) -> str | None:
    candidate = raw_value.strip().lstrip("@")
    if not candidate:
        return None
    if re.fullmatch(r"[A-Za-z0-9_]{1,15}", candidate):
        return candidate
    return None


def _extract_x_username(raw_value: str) -> str | None:
    candidate = raw_value.strip()
    if not candidate:
        return None

    if re.match(r"^(?:www\.)?(?:mobile\.)?(?:x|twitter)\.com/", candidate, flags=re.IGNORECASE):
        candidate = "https://" + candidate.lstrip("/")

    if not re.match(r"^https?://", candidate, flags=re.IGNORECASE):
        return _normalize_x_username(candidate)

    parsed = urlparse(candidate)
    host = parsed.netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    if host not in {"x.com", "twitter.com", "mobile.twitter.com"}:
        return None

    segments = [segment for segment in parsed.path.split("/") if segment]
    if not segments:
        return None

    reserved_segments = {
        "explore",
        "hashtag",
        "home",
        "i",
        "intent",
        "messages",
        "notifications",
        "search",
        "settings",
        "share",
        "tos",
        "privacy",
    }
    if segments[0].lower() in reserved_segments:
        return None

    return _normalize_x_username(segments[0])


def _parse_x_accounts_input(raw_text: str) -> tuple[list[str], list[str]]:
    usernames: list[str] = []
    invalid_entries: list[str] = []

    for raw_line in str(raw_text or "").replace("\r\n", "\n").split("\n"):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        username = _extract_x_username(line)
        if username:
            usernames.append(username)
        else:
            invalid_entries.append(line)

    return _merge_unique_strings(usernames), invalid_entries


def _collect_generated_files(result_dirs: list[Path]) -> list[dict]:
    generated_files = []

    for dir_path in result_dirs:
        if not dir_path.exists():
            continue

        for md_file in dir_path.glob("*.md"):
            content = md_file.read_text(encoding="utf-8")
            generated_files.append({
                "type": "markdown",
                "name": md_file.name,
                "content": content,
                "source": dir_path.parent.name,
            })

        for html_file in dir_path.glob("*.html"):
            generated_files.append({
                "type": "html",
                "name": html_file.name,
                "url": f"/api/file/{dir_path.parent.name}/{dir_path.name}/{html_file.name}",
                "source": dir_path.parent.name,
            })

        json_dir = dir_path / "json"
        if json_dir.exists():
            items = []
            for json_file in json_dir.glob("*.json"):
                data = json.loads(json_file.read_text(encoding="utf-8"))
                items.append(data)
            if items:
                generated_files.append({
                    "type": "json_list",
                    "name": f"{dir_path.parent.name}_items",
                    "items": items,
                    "source": dir_path.parent.name,
                })

    return generated_files


# ============== Models ==============

class Config(BaseModel):
    desktop_python_path: str = ""
    profile_name: str = ""
    profile_avatar: str = "1"
    onboarding_completed: bool = False
    model_mode: Literal["custom", "managed"] = "custom"
    smtp_mode: Literal["custom", "managed"] = "custom"
    provider: str = "openai"
    model: str = "gpt-4o-mini"
    base_url: str = ""
    api_key: str = ""
    temperature: float = 0.5
    smtp_server: str = ""
    smtp_port: int = 465
    sender: str = ""
    receiver: str = ""
    smtp_password: str = ""
    gh_languages: str = "all"
    gh_since: str = "daily"
    gh_max_repos: int = 30
    hf_content_types: list[str] = ["papers", "models"]
    hf_max_papers: int = 30
    hf_max_models: int = 15
    description: str = ""
    researcher_profile: str = ""
    user_researcher_profile: str = ""
    x_rapidapi_key: str = ""
    x_rapidapi_host: str = "twitter-api45.p.rapidapi.com"
    x_accounts: str = ""
    arxiv_categories: str = "cs.AI"
    arxiv_max_entries: int = 100
    arxiv_max_papers: int = 60
    log_level: Literal["progress", "standard", "verbose"] = "standard"
    visible_sources: list[str] = list(DEFAULT_VISIBLE_SOURCES)
    ss_max_results: int = 60
    ss_max_papers: int = 30
    ss_year: str = ""
    ss_api_key: str = ""
    schedule_enabled: bool = False
    schedule_frequency: str = "daily"
    schedule_time: str = "08:00"
    schedule_sources: list[str] = []
    schedule_generate_report: bool = False
    schedule_generate_ideas: bool = False


class RunRequest(BaseModel):
    sources: list[str]
    generate_report: bool = False
    generate_ideas: bool = False
    save: bool = True
    receiver: str = ""
    description: str = ""
    researcher_profile: str = ""
    scholar_urls: str = ""
    x_accounts_input: str = ""
    delivery_mode: Literal["source_emails", "combined_report", "both"] = "source_emails"


# ============== Config API ==============

@app.get("/api/config")
def get_config():
    """获取当前配置"""
    return load_config_data()


@app.get("/api/public/meta")
def get_public_meta():
    config = load_config_data()
    smtp_config = resolve_smtp_config(config)
    return {
        "github_url": GITHUB_REPO_URL,
        "twitter_enabled": bool(config.get("x_rapidapi_key")),
        "mail_enabled": bool(smtp_config.get("smtp_server") and smtp_config.get("sender")),
        "arxiv_enabled": True,
    }


@app.post("/api/config")
def save_config(config: Config):
    """保存配置"""
    try:
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        config_dict = config.model_dump() if hasattr(config, "model_dump") else config.dict()
        config_dict["description"] = _normalize_multiline_text(config_dict.get("description", ""))
        config_dict["researcher_profile"] = _normalize_multiline_text(config_dict.get("researcher_profile", ""))
        config_dict["user_researcher_profile"] = _normalize_multiline_text(config_dict.get("user_researcher_profile", ""))
        config_dict["x_accounts"] = _normalize_multiline_text(config_dict.get("x_accounts", ""))
        config_dict["profile_name"] = str(config_dict.get("profile_name", "")).strip()
        config_dict["profile_avatar"] = str(config_dict.get("profile_avatar", "1")).strip() or "1"
        config_dict["model_mode"] = str(config_dict.get("model_mode", "custom")).strip() or "custom"
        config_dict["smtp_mode"] = str(config_dict.get("smtp_mode", "custom")).strip() or "custom"
        config_dict["log_level"] = _normalize_log_level(config_dict.get("log_level", "standard"))
        config_dict["visible_sources"] = _normalize_visible_sources(config_dict.get("visible_sources"))

        serialized_config = json.dumps(config_dict, indent=2, ensure_ascii=False)
        CONFIG_FILE.write_text(serialized_config, encoding="utf-8")
        CLIENT_CONFIG_FILE.write_text(serialized_config, encoding="utf-8")

        env_content = f"""# Auto-generated by web UI
DESKTOP_PYTHON_PATH={config.desktop_python_path}
PROVIDER={config.provider}
MODEL_NAME={config.model}
BASE_URL={config.base_url}
API_KEY={config.api_key}
TEMPERATURE={config.temperature}
LOG_LEVEL={config.log_level}
SMTP_SERVER={config.smtp_server}
SMTP_PORT={config.smtp_port}
SMTP_SENDER={config.sender}
SMTP_RECEIVER={config.receiver}
SMTP_PASSWORD={config.smtp_password}
GH_LANGUAGES={config.gh_languages}
GH_SINCE={config.gh_since}
GH_MAX_REPOS={config.gh_max_repos}
HF_CONTENT_TYPES={" ".join(config.hf_content_types)}
HF_MAX_PAPERS={config.hf_max_papers}
HF_MAX_MODELS={config.hf_max_models}
DESCRIPTION_FILE=profiles/description.txt
USER_RESEARCHER_PROFILE_FILE=profiles/user_researcher_profile.md
X_RAPIDAPI_KEY={config.x_rapidapi_key}
X_RAPIDAPI_HOST={config.x_rapidapi_host}
X_ACCOUNTS_FILE=profiles/x_accounts.txt
ARXIV_CATEGORIES={config.arxiv_categories}
ARXIV_MAX_ENTRIES={config.arxiv_max_entries}
ARXIV_MAX_PAPERS={config.arxiv_max_papers}
SS_MAX_RESULTS={config.ss_max_results}
SS_MAX_PAPERS={config.ss_max_papers}
SS_YEAR={config.ss_year}
SS_API_KEY={config.ss_api_key}
"""
        (PROJECT_ROOT / ".env").write_text(env_content, encoding="utf-8")

        effective_researcher_profile = _build_effective_researcher_profile(
            config.researcher_profile,
            config.user_researcher_profile,
            config.description,
        )

        _write_text_file(DESCRIPTION_FILE, config.description)
        _write_text_file(RESEARCHER_PROFILE_FILE, effective_researcher_profile, delete_if_empty=True)
        _write_text_file(USER_RESEARCHER_PROFILE_FILE, config.user_researcher_profile, delete_if_empty=True)
        _delete_file_if_exists(LEGACY_USER_RESEARCHER_PROFILE_FILE)
        _write_text_file(TWITTER_ACCOUNTS_FILE, config.x_accounts)

        return {"status": "ok"}
    except Exception as e:
        import traceback

        print(f"保存配置失败: {e}")
        print(traceback.format_exc())
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


# ============== Run API ==============

async def run_daily_recommender(req: RunRequest):
    """异步运行 daily-recommender"""

    if not req.sources:
        raise ValueError("请至少选择一个信息源。")

    today = datetime.now().strftime("%Y-%m-%d")
    result_dirs: list[Path] = []
    config = load_config_data()
    temp_dir = tempfile.TemporaryDirectory(prefix="daily-recommender-web-")
    temp_root = Path(temp_dir.name)

    try:
        override_description = _normalize_multiline_text(req.description)
        receiver = req.receiver.strip() or str(config.get("receiver", "")).strip()
        log_level = _normalize_log_level(config.get("log_level", "standard"))
        smtp_config = resolve_smtp_config(config)
        user_researcher_profile = _normalize_multiline_text(config.get("user_researcher_profile", ""))
        custom_x_accounts, invalid_x_accounts = _parse_x_accounts_input(req.x_accounts_input)

        base_description = override_description or _normalize_multiline_text(config.get("description", ""))
        effective_description = base_description
        report_profile_path: Path | None = None
        description_path: Path | None = None
        researcher_profile_path: Path | None = None
        profile_urls: list[str] = [
            url.strip()
            for url in re.split(r"[\n,]+", req.scholar_urls)
            if url.strip()
        ]

        if invalid_x_accounts:
            preview = "、".join(invalid_x_accounts[:3])
            raise ValueError(
                f"以下 X 信息源无法识别：{preview}。仅支持 用户名、@用户名 或 https://x.com/username 链接。"
            )

        # Keep the canonical interest profile file in sync with the latest
        # run input so downstream code that still reads profiles/description.txt
        # observes the same Positive/Negative content as the desktop client.
        _write_text_file(DESCRIPTION_FILE, base_description)

        def should_emit(level: str) -> bool:
            return _log_level_value(log_level) >= _log_level_value(level)

        def emit_log(level: str, message: str):
            if should_emit(level):
                return {"type": "log", "message": message}
            return None

        startup_logs = [
            ("progress", f"准备运行 {len(req.sources)} 个信息源: {', '.join(req.sources)}"),
            ("standard", f"当前日志级别: {log_level}"),
        ]
        if base_description:
            startup_logs.append(("standard", "已同步本次兴趣描述到 profiles/description.txt"))
        if user_researcher_profile:
            startup_logs.append(("verbose", f"Researcher self profile: {user_researcher_profile}"))
        if base_description:
            startup_logs.append(("verbose", f"Using interest profile: {base_description}"))
        for level, message in startup_logs:
            payload = emit_log(level, message)
            if payload:
                yield payload

        if profile_urls:
            payload = emit_log("progress", f"正在读取 {len(profile_urls)} 个 Google Scholar / 主页信息...")
            if payload:
                yield payload
            profile_text, _ = await asyncio.to_thread(build_profile_text_from_urls, profile_urls)
            profile_text = _normalize_multiline_text(profile_text)
            if profile_text:
                effective_description = "\n\n".join(
                    part
                    for part in [
                        effective_description,
                        "[Optional profile URL context]\n" + profile_text,
                    ]
                    if part
                ).strip()
                payload = emit_log("standard", f"已附加 {len(profile_urls)} 个 Scholar 画像信息到本次请求。")
                if payload:
                    yield payload
                payload = emit_log("verbose", f"Scholar profile text: {profile_text}")
                if payload:
                    yield payload
            else:
                payload = emit_log("standard", "Scholar 页面未返回可用文本，将继续使用输入兴趣。")
                if payload:
                    yield payload

        if effective_description:
            description_path = temp_root / "description.txt"
            description_path.write_text(effective_description + "\n", encoding="utf-8")
            report_profile_path = description_path

        if req.researcher_profile.strip():
            researcher_profile_path = temp_root / "researcher_profile.md"
            researcher_profile_path.write_text(
                _normalize_multiline_text(req.researcher_profile) + "\n",
                encoding="utf-8",
            )
            report_profile_path = researcher_profile_path
        elif req.generate_ideas:
            base_profile = _build_effective_researcher_profile(
                config.get("researcher_profile", ""),
                user_researcher_profile,
                effective_description,
            )
            if not base_profile:
                raise ValueError("生成研究想法前，请先配置研究者画像或在本次请求中填写兴趣描述。")
            researcher_profile_path = temp_root / "researcher_profile.md"
            researcher_profile_path.write_text(base_profile + "\n", encoding="utf-8")
            payload = emit_log("standard", "已根据用户自述与兴趣描述生成本次 researcher profile。")
            if payload:
                yield payload

        should_generate_report = req.generate_report or req.delivery_mode in ("combined_report", "both")
        should_send_combined_report = req.delivery_mode in ("combined_report", "both")
        should_skip_source_emails = req.delivery_mode == "combined_report"

        if should_send_combined_report and not receiver:
            raise ValueError("请输入接收邮件的邮箱地址。")

        if receiver and (not smtp_config.get("smtp_server") or not smtp_config.get("sender")):
            raise ValueError("服务器还没有配置发件邮箱，请先在 /admin 完成 SMTP 配置。")

        cmd = [
            sys.executable,
            "main.py",
            "--sources",
            *req.sources,
            "--num_workers",
            "4",
            "--provider",
            config.get("provider", "openai"),
            "--model",
            config.get("model", "gpt-4o-mini"),
            "--base_url",
            config.get("base_url", ""),
            "--api_key",
            config.get("api_key", ""),
            "--temperature",
            str(config.get("temperature", 0.5)),
        ]

        if req.save:
            cmd.append("--save")
        if description_path:
            _append_arg(cmd, "--description", description_path)

        # Pass profile hash for eval cache isolation
        if effective_description:
            from cache_utils import stable_profile_hash
            _append_arg(cmd, "--profile_hash", stable_profile_hash(effective_description))

        if should_generate_report:
            cmd.append("--generate_report")
            result_dirs.append(HISTORY_DIR / "reports" / today)
            if report_profile_path:
                _append_arg(cmd, "--report_profile", report_profile_path)
            if should_send_combined_report:
                cmd.append("--send_report_email")
            if should_skip_source_emails:
                cmd.append("--skip_source_emails")

        if req.generate_ideas:
            if not researcher_profile_path:
                raise ValueError("生成研究想法需要研究者画像。")
            cmd.extend(["--generate_ideas", "--researcher_profile", str(researcher_profile_path)])
            result_dirs.append(HISTORY_DIR / "ideas" / today)

        _append_arg(cmd, "--smtp_server", smtp_config.get("smtp_server"))
        _append_arg(cmd, "--smtp_port", smtp_config.get("smtp_port"))
        _append_arg(cmd, "--sender", smtp_config.get("sender"))
        _append_arg(cmd, "--receiver", receiver)
        _append_arg(cmd, "--sender_password", smtp_config.get("smtp_password"))

        cmd.extend([
            "--gh_languages",
            config.get("gh_languages", "all"),
            "--gh_since",
            config.get("gh_since", "daily"),
            "--gh_max_repos",
            str(config.get("gh_max_repos", 30)),
        ])

        hf_types = config.get("hf_content_types", ["papers", "models"]) or ["papers", "models"]
        cmd.extend([
            "--hf_content_type",
            *hf_types,
            "--hf_max_papers",
            str(config.get("hf_max_papers", 30)),
            "--hf_max_models",
            str(config.get("hf_max_models", 15)),
        ])

        if "twitter" in req.sources:
            _append_arg(cmd, "--x_rapidapi_key", config.get("x_rapidapi_key"))
            _append_arg(cmd, "--x_rapidapi_host", config.get("x_rapidapi_host"))
            accounts_file_path: Path = TWITTER_ACCOUNTS_FILE
            if custom_x_accounts:
                static_x_accounts, _ = _parse_x_accounts_input(_read_text_if_exists(TWITTER_ACCOUNTS_FILE))
                merged_x_accounts = _merge_unique_strings(custom_x_accounts, static_x_accounts)
                accounts_file_path = temp_root / "x_accounts.request.txt"
                accounts_file_path.write_text("\n".join(merged_x_accounts) + "\n", encoding="utf-8")
                payload = emit_log("standard", f"已附加 {len(custom_x_accounts)} 个本次请求专用的 X 信息源。")
                if payload:
                    yield payload
            _append_arg(cmd, "--x_accounts_file", accounts_file_path)

            should_run_oneoff_discovery = bool(override_description or profile_urls)
            if should_run_oneoff_discovery:
                discovery_persist_file = temp_root / "x_accounts.discovered.txt"
                cmd.extend([
                    "--x_discover_accounts",
                    "--x_merge_static_accounts",
                    "--x_force_refresh_discovery",
                    "--x_discovery_persist_file",
                    str(discovery_persist_file),
                ])
                if profile_urls:
                    cmd.extend(["--x_profile_urls", *profile_urls])

        if "arxiv" in req.sources:
            arxiv_cats = config.get("arxiv_categories", "cs.AI")
            cat_list = [c.strip() for c in arxiv_cats.split() if c.strip()]
            cmd.extend(["--arxiv_categories", *cat_list])
            cmd.extend([
                "--arxiv_max_entries",
                str(config.get("arxiv_max_entries", 100)),
                "--arxiv_max_papers",
                str(config.get("arxiv_max_papers", 60)),
            ])

        if "semanticscholar" in req.sources:
            cmd.extend([
                "--ss_max_results",
                str(config.get("ss_max_results", 60)),
                "--ss_max_papers",
                str(config.get("ss_max_papers", 30)),
            ])
            ss_year = config.get("ss_year", "")
            if ss_year:
                cmd.extend(["--ss_year", ss_year])
            ss_api_key = config.get("ss_api_key", "")
            if ss_api_key:
                cmd.extend(["--ss_api_key", ss_api_key])

        _append_arg(cmd, "--log_level", log_level)

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(PROJECT_ROOT),
        )

        while True:
            line = await process.stdout.readline()
            if not line:
                break
            text = _decode_process_line(line)
            payload = emit_log(_classify_process_log(text), text)
            if payload:
                yield payload

        await process.wait()

        for src in req.sources:
            result_dirs.append(HISTORY_DIR / src / today)

        generated_files = _collect_generated_files(result_dirs)

        yield {
            "type": "complete",
            "exit_code": process.returncode,
            "success": process.returncode == 0,
            "files": generated_files,
            "date": today,
        }
    finally:
        temp_dir.cleanup()


@app.websocket("/ws/run")
async def websocket_run(websocket: WebSocket):
    """WebSocket 实时运行日志"""
    await websocket.accept()

    try:
        data = await websocket.receive_json()
        req = RunRequest(**data)

        await websocket.send_json({"type": "start", "message": "开始运行..."})

        async for msg in run_daily_recommender(req):
            await websocket.send_json(msg)

    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        await websocket.send_json({
            "type": "error",
            "message": str(e),
        })


# ============== History API ==============

@app.get("/api/history")
def get_history():
    """获取历史运行记录"""
    history = []

    if not HISTORY_DIR.exists():
        return []

    for source_dir in HISTORY_DIR.iterdir():
        if not source_dir.is_dir():
            continue

        source_name = source_dir.name

        for date_dir in source_dir.iterdir():
            if not date_dir.is_dir():
                continue

            date_str = date_dir.name
            has_results = list(date_dir.glob("*.md")) or list(date_dir.glob("*.html"))
            json_files = list(date_dir.glob("json/*.json"))

            if has_results or json_files:
                history.append({
                    "id": f"{source_name}_{date_str}",
                    "type": source_name,
                    "date": date_str,
                    "sources": [source_name.replace("_", ", ")],
                    "items": len(json_files),
                    "path": str(date_dir.relative_to(PROJECT_ROOT)),
                })

    history.sort(key=lambda x: x["date"], reverse=True)
    return history


@app.get("/api/results/{source}/{date}")
def get_results(source: str, date: str):
    """获取某天的详细结果"""
    result_dir = HISTORY_DIR / source / date

    if not result_dir.exists():
        return JSONResponse({"error": "Not found"}, status_code=404)

    results = {
        "source": source,
        "date": date,
        "markdown_files": [],
        "html_files": [],
        "json_files": [],
    }

    for f in result_dir.glob("*.md"):
        results["markdown_files"].append({
            "name": f.name,
            "content": f.read_text(encoding="utf-8"),
        })

    for f in result_dir.glob("*.html"):
        results["html_files"].append({
            "name": f.name,
            "url": f"/api/file/{source}/{date}/{f.name}",
        })

    json_dir = result_dir / "json"
    if json_dir.exists():
        for f in json_dir.glob("*.json"):
            results["json_files"].append({
                "name": f.name,
                "data": json.loads(f.read_text(encoding="utf-8")),
            })

    return results


@app.get("/api/file/{source}/{date}/{filename}")
def get_file(source: str, date: str, filename: str):
    """获取文件内容"""
    file_path = HISTORY_DIR / source / date / filename

    if not file_path.exists():
        return JSONResponse({"error": "Not found"}, status_code=404)

    return FileResponse(file_path)


# ============== Static Files ==============

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "Daily Recommender"}


@app.get("/")
def root():
    return FileResponse(PUBLIC_UI_FILE)


@app.get("/public")
def public_web_ui():
    return FileResponse(PUBLIC_UI_FILE)


@app.get("/admin")
def admin_web_ui():
    return FileResponse(ADMIN_UI_FILE)


@app.get("/desktop")
def desktop_web_ui():
    if CLIENT_DIST_INDEX_FILE.exists():
        return FileResponse(CLIENT_DIST_INDEX_FILE)
    return FileResponse(DESKTOP_UI_FILE)


@app.get("/desktop/{asset_path:path}")
def desktop_client_asset(asset_path: str):
    if CLIENT_DIST_INDEX_FILE.exists():
        resolved = _resolve_client_dist_path(asset_path)
        if resolved and resolved.is_file():
            media_type, _ = mimetypes.guess_type(str(resolved))
            return FileResponse(resolved, media_type=media_type)

        if asset_path and "." not in Path(asset_path).name:
            return FileResponse(CLIENT_DIST_INDEX_FILE)

        return JSONResponse({"error": "Not found"}, status_code=404)

    return JSONResponse({"error": "Desktop client build not found"}, status_code=404)


@app.get("/web-ui.html")
def legacy_admin_web_ui():
    return FileResponse(ADMIN_UI_FILE)


# ============== Scheduler ==============

_scheduler_task: asyncio.Task | None = None
_last_scheduled_run: str = ""


def _should_run_today(frequency: str) -> bool:
    """Check if the scheduler should run today based on frequency."""
    now = datetime.now()
    weekday = now.weekday()  # 0=Mon, 6=Sun
    if frequency == "daily":
        return True
    if frequency == "weekdays":
        return weekday < 5  # Mon-Fri
    if frequency == "weekly":
        return weekday == 0  # Monday
    if frequency == "monthly":
        return now.day == 1
    return False


async def _scheduler_loop():
    """Background loop that checks schedule config and triggers runs."""
    global _last_scheduled_run
    while True:
        try:
            await asyncio.sleep(30)  # check every 30s
            config = load_config_data()
            if not config.get("schedule_enabled"):
                continue

            frequency = config.get("schedule_frequency", "daily")
            schedule_time = config.get("schedule_time", "08:00")
            sources = config.get("schedule_sources", [])
            if not sources:
                continue

            now = datetime.now()
            current_time = now.strftime("%H:%M")
            today_key = f"{now.strftime('%Y-%m-%d')}_{schedule_time}"

            if today_key == _last_scheduled_run:
                continue
            if current_time != schedule_time:
                continue
            if not _should_run_today(frequency):
                continue

            _last_scheduled_run = today_key
            print(f"[Scheduler] Triggering scheduled run: {frequency} @ {schedule_time}, sources={sources}")

            req = RunRequest(
                sources=sources,
                generate_report=config.get("schedule_generate_report", False),
                generate_ideas=config.get("schedule_generate_ideas", False),
                save=True,
                delivery_mode="source_emails",
            )
            async for msg in run_daily_recommender(req):
                if msg.get("type") == "log":
                    print(f"[Scheduler] {msg.get('message', '')}")
                elif msg.get("type") == "complete":
                    status = "success" if msg.get("success") else "failed"
                    print(f"[Scheduler] Run completed: {status}")
                elif msg.get("type") == "error":
                    print(f"[Scheduler] Error: {msg.get('message', '')}")

        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[Scheduler] Error in scheduler loop: {e}")
            await asyncio.sleep(60)


@app.on_event("startup")
async def _start_scheduler():
    global _scheduler_task
    _scheduler_task = asyncio.create_task(_scheduler_loop())
    print("[Scheduler] Background scheduler started.")


@app.get("/api/schedule/status")
def get_schedule_status():
    """Return current schedule config and last run info."""
    config = load_config_data()
    return {
        "enabled": config.get("schedule_enabled", False),
        "frequency": config.get("schedule_frequency", "daily"),
        "time": config.get("schedule_time", "08:00"),
        "sources": config.get("schedule_sources", []),
        "generate_report": config.get("schedule_generate_report", False),
        "generate_ideas": config.get("schedule_generate_ideas", False),
        "last_run": _last_scheduled_run,
    }


# ============== Swipe (PaperTinder) ==============


def _load_swipe_feedback() -> dict:
    if SWIPE_FEEDBACK_FILE.exists():
        try:
            return json.loads(SWIPE_FEEDBACK_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass
    return {"swiped": {}, "stats": {"liked": 0, "disliked": 0, "total": 0}}


def _save_swipe_feedback(data: dict) -> None:
    SWIPE_FEEDBACK_FILE.parent.mkdir(parents=True, exist_ok=True)
    SWIPE_FEEDBACK_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _collect_unseen_items(sources: list[str], days: int, swiped_urls: set[str], limit: int) -> tuple[list[dict], int]:
    today = datetime.now().strftime("%Y-%m-%d")
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    items: list[dict] = []
    total_unseen = 0

    for source in sources:
        source_dir = HISTORY_DIR / source
        if not source_dir.is_dir():
            continue
        for date_dir in sorted(source_dir.iterdir(), reverse=True):
            if not date_dir.is_dir():
                continue
            date_str = date_dir.name
            if date_str < cutoff:
                break
            json_dir = date_dir / "json"
            if not json_dir.is_dir():
                continue
            for json_file in json_dir.glob("*.json"):
                try:
                    data = json.loads(json_file.read_text(encoding="utf-8"))
                except (json.JSONDecodeError, OSError):
                    continue
                url = data.get("url", "")
                if not url or url in swiped_urls:
                    continue
                total_unseen += 1
                data["_source_type"] = source
                data["_date"] = date_str
                data["_is_today"] = date_str == today
                items.append(data)

    items.sort(key=lambda x: (not x.get("_is_today", False), -x.get("score", 0), x.get("_date", "")))
    return items[:limit], total_unseen


class SwipeFeedbackRequest(BaseModel):
    url: str
    action: Literal["like", "dislike", "skip"]
    source: str = ""
    title: str = ""


@app.get("/api/swipe/queue")
def get_swipe_queue(sources: str = "", days: int = 7, limit: int = 50):
    source_list = [s.strip() for s in sources.split(",") if s.strip()] if sources else ["arxiv", "huggingface", "github", "semanticscholar"]
    fb = _load_swipe_feedback()
    swiped_urls = set(fb.get("swiped", {}).keys())
    items, total_unseen = _collect_unseen_items(source_list, days, swiped_urls, limit)
    return {"items": items, "total_unseen": total_unseen, "total_swiped": fb["stats"].get("total", 0)}


@app.post("/api/swipe/feedback")
def record_swipe_feedback(req: SwipeFeedbackRequest):
    fb = _load_swipe_feedback()
    swiped = fb.setdefault("swiped", {})
    stats = fb.setdefault("stats", {"liked": 0, "disliked": 0, "total": 0})

    was_existing = req.url in swiped
    old_action = swiped.get(req.url, {}).get("action") if was_existing else None

    swiped[req.url] = {
        "action": req.action,
        "ts": datetime.now().isoformat(),
        "source": req.source,
        "title": req.title,
    }

    if was_existing and old_action:
        if old_action == "like":
            stats["liked"] = max(0, stats["liked"] - 1)
        elif old_action == "dislike":
            stats["disliked"] = max(0, stats["disliked"] - 1)
        stats["total"] = max(0, stats["total"] - 1)

    if req.action == "like":
        stats["liked"] += 1
    elif req.action == "dislike":
        stats["disliked"] += 1
    stats["total"] += 1

    _save_swipe_feedback(fb)
    return {"status": "ok", "stats": stats}


@app.get("/api/swipe/stats")
def get_swipe_stats():
    fb = _load_swipe_feedback()
    return fb.get("stats", {"liked": 0, "disliked": 0, "total": 0})


@app.post("/api/swipe/apply-feedback")
def apply_swipe_feedback():
    fb = _load_swipe_feedback()
    swiped = fb.get("swiped", {})
    if not swiped:
        return {"status": "ok", "message": "No swipe data yet."}

    liked_titles = [v["title"] for v in swiped.values() if v.get("action") == "like" and v.get("title")]
    disliked_titles = [v["title"] for v in swiped.values() if v.get("action") == "dislike" and v.get("title")]

    # Extract simple keyword signals from titles
    def _extract_keywords(titles: list[str], top_n: int = 10) -> list[str]:
        from collections import Counter
        words: Counter[str] = Counter()
        stop = {"a", "an", "the", "of", "for", "and", "in", "on", "to", "with", "via", "from", "by", "is", "are", "at", "as"}
        for t in titles:
            for w in re.split(r"[\s/\-:,.()\[\]]+", t):
                w = w.strip().lower()
                if len(w) > 2 and w not in stop and not w.isdigit():
                    words[w] += 1
        return [w for w, _ in words.most_common(top_n) if _ >= 2]

    positive = _extract_keywords(liked_titles)
    negative = _extract_keywords(disliked_titles)

    # Read and update description.txt
    desc_path = DESCRIPTION_FILE
    content = desc_path.read_text(encoding="utf-8") if desc_path.exists() else ""

    marker_start = "--- Swipe-derived preferences (auto-updated) ---"
    marker_end = "---"
    if marker_start in content:
        before = content[: content.index(marker_start)].rstrip()
    else:
        before = content.rstrip()

    stats = fb.get("stats", {})
    block = (
        f"\n\n{marker_start}\n"
        f"Positive signals: {' | '.join(positive) if positive else '(none yet)'}\n"
        f"Negative signals: {' | '.join(negative) if negative else '(none yet)'}\n"
        f"Last updated: {datetime.now().strftime('%Y-%m-%d')}, "
        f"based on {stats.get('liked', 0)} likes / {stats.get('disliked', 0)} dislikes\n"
        f"{marker_end}\n"
    )

    desc_path.write_text(before + block, encoding="utf-8")
    return {"status": "ok", "positive": positive, "negative": negative}


# ============== Main ==============

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8090"))

    print(f"""
╔════════════════════════════════════════════════════════╗
║          Daily Recommender Web Server                  ║
╠════════════════════════════════════════════════════════╣
║  Public UI: http://localhost:{port}/                    ║
║  Admin UI:  http://localhost:{port}/admin               ║
║  API Docs:  http://localhost:{port}/docs                ║
╚════════════════════════════════════════════════════════╝
    """)

    uvicorn.run(app, host="0.0.0.0", port=port)
