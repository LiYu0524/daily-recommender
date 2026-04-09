"""
Daily Recommender Web Backend
FastAPI + WebSocket 实时日志
"""

from __future__ import annotations

import asyncio
import json
import locale
import mimetypes
import re
import sys
import tempfile
from datetime import datetime
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
TWITTER_ACCOUNTS_FILE = PROJECT_ROOT / "profiles" / "x_accounts.txt"
GITHUB_REPO_URL = "https://github.com/LiYu0524/daily-recommender"

DEFAULT_CONFIG = {
    "desktop_python_path": "",
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
    "x_rapidapi_key": "",
    "x_rapidapi_host": "twitter-api45.p.rapidapi.com",
    "x_accounts": "",
    "arxiv_categories": "cs.AI",
    "arxiv_max_entries": 100,
    "arxiv_max_papers": 60,
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

    file_backed_values = {
        "description": _read_text_if_exists(DESCRIPTION_FILE),
        "researcher_profile": _read_text_if_exists(RESEARCHER_PROFILE_FILE),
        "x_accounts": _read_text_if_exists(TWITTER_ACCOUNTS_FILE),
    }
    for key, value in file_backed_values.items():
        if value:
            config[key] = value

    if not config.get("hf_content_types"):
        config["hf_content_types"] = ["papers", "models"]
    if not config.get("x_rapidapi_host"):
        config["x_rapidapi_host"] = DEFAULT_CONFIG["x_rapidapi_host"]

    return config


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


def _append_arg(cmd: list[str], flag: str, value: str | int | float | None) -> None:
    if value in (None, ""):
        return
    cmd.extend([flag, str(value)])


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
    x_rapidapi_key: str = ""
    x_rapidapi_host: str = "twitter-api45.p.rapidapi.com"
    x_accounts: str = ""
    arxiv_categories: str = "cs.AI"
    arxiv_max_entries: int = 100
    arxiv_max_papers: int = 60


class RunRequest(BaseModel):
    sources: list[str]
    generate_report: bool = False
    generate_ideas: bool = False
    save: bool = True
    receiver: str = ""
    description: str = ""
    researcher_profile: str = ""
    scholar_url: str = ""
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
    return {
        "github_url": GITHUB_REPO_URL,
        "twitter_enabled": bool(config.get("x_rapidapi_key")),
        "mail_enabled": bool(config.get("smtp_server") and config.get("sender")),
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
        config_dict["x_accounts"] = _normalize_multiline_text(config_dict.get("x_accounts", ""))

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
X_RAPIDAPI_KEY={config.x_rapidapi_key}
X_RAPIDAPI_HOST={config.x_rapidapi_host}
X_ACCOUNTS_FILE=profiles/x_accounts.txt
ARXIV_CATEGORIES={config.arxiv_categories}
ARXIV_MAX_ENTRIES={config.arxiv_max_entries}
ARXIV_MAX_PAPERS={config.arxiv_max_papers}
"""
        (PROJECT_ROOT / ".env").write_text(env_content, encoding="utf-8")

        _write_text_file(DESCRIPTION_FILE, config.description)
        _write_text_file(RESEARCHER_PROFILE_FILE, config.researcher_profile, delete_if_empty=True)
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
        scholar_url = req.scholar_url.strip()
        receiver = req.receiver.strip() or str(config.get("receiver", "")).strip()
        custom_x_accounts, invalid_x_accounts = _parse_x_accounts_input(req.x_accounts_input)

        effective_description = override_description or _normalize_multiline_text(config.get("description", ""))
        report_profile_path: Path | None = None
        description_path: Path | None = None
        researcher_profile_path: Path | None = None
        profile_urls: list[str] = []

        if invalid_x_accounts:
            preview = "、".join(invalid_x_accounts[:3])
            raise ValueError(
                f"以下 X 信息源无法识别：{preview}。仅支持 用户名、@用户名 或 https://x.com/username 链接。"
            )

        if scholar_url:
            profile_urls.append(scholar_url)
            yield {"type": "log", "message": "正在读取 Google Scholar / 主页信息..."}
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
                yield {"type": "log", "message": "已附加 Scholar 画像信息到本次请求。"}
            else:
                yield {"type": "log", "message": "Scholar 页面未返回可用文本，将继续使用输入兴趣。"}

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
            base_profile = _normalize_multiline_text(config.get("researcher_profile", "")) or effective_description
            if not base_profile:
                raise ValueError("生成研究想法前，请先配置研究者画像或在本次请求中填写兴趣描述。")
            researcher_profile_path = temp_root / "researcher_profile.md"
            researcher_profile_path.write_text(base_profile + "\n", encoding="utf-8")

        should_generate_report = req.generate_report or req.delivery_mode in ("combined_report", "both")
        should_send_combined_report = req.delivery_mode in ("combined_report", "both")
        should_skip_source_emails = req.delivery_mode == "combined_report"

        if should_send_combined_report and not receiver:
            raise ValueError("请输入接收邮件的邮箱地址。")

        if receiver and (not config.get("smtp_server") or not config.get("sender")):
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

        _append_arg(cmd, "--smtp_server", config.get("smtp_server"))
        _append_arg(cmd, "--smtp_port", config.get("smtp_port"))
        _append_arg(cmd, "--sender", config.get("sender"))
        _append_arg(cmd, "--receiver", receiver)
        _append_arg(cmd, "--sender_password", config.get("smtp_password"))

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
                yield {
                    "type": "log",
                    "message": f"已附加 {len(custom_x_accounts)} 个本次请求专用的 X 信息源。",
                }
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
            yield {"type": "log", "message": text}

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
