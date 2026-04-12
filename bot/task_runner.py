"""Async task runner: wraps run_daily_recommender() for bot-triggered runs."""

from __future__ import annotations

import asyncio
import os
import re
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Coroutine

from bot.commands import RunParams
from bot.models import UnifiedInboundEvent, UnifiedOutboundAction

# Concurrency controls
_active_tasks: dict[str, asyncio.Task] = {}
_semaphore = asyncio.Semaphore(3)

# Log lines matching these patterns are forwarded to the user as progress updates
_PROGRESS_PATTERNS = [
    re.compile(r"^\[(\w+)\] =+"),                    # [arxiv] ====== (source start)
    re.compile(r"^\[(\w+)\] Starting source"),        # [arxiv] Starting source
    re.compile(r"^\[(\w+)\] Completed with"),         # [arxiv] Completed with N recommendations
    re.compile(r"^\[(\w+)\] Fetched \d+"),            # [arxiv] Fetched 100 items
    re.compile(r"^\[(\w+)\] Scored \d+"),             # [arxiv] Scored 60 items
    re.compile(r"^\[(\w+)\] Source failed"),           # [arxiv] Source failed: ...
    re.compile(r"^Generating cross-source report"),    # report phase
    re.compile(r"^Generating research ideas"),         # ideas phase
    re.compile(r"^LLM is available"),                  # LLM check passed
    re.compile(r"^LLM test failed"),                   # LLM check failed
    re.compile(r"^Running \d+ sources in parallel"),   # parallel start
    re.compile(r"^All sources completed"),             # pipeline done
    re.compile(r"^Testing LLM availability"),          # LLM test start
]

# Minimum interval between progress messages to avoid flooding (seconds)
_PROGRESS_INTERVAL = 3.0
_BOT_TEXT_CHUNK_LIMIT = 1800


def _is_progress_line(line: str) -> bool:
    return any(p.search(line) for p in _PROGRESS_PATTERNS)


def _split_bot_text(text: str, limit: int = _BOT_TEXT_CHUNK_LIMIT) -> list[str]:
    """Split long text into chunks to avoid channel message limits."""
    if len(text) <= limit:
        return [text]

    chunks: list[str] = []
    remaining = text
    while remaining:
        if len(remaining) <= limit:
            chunks.append(remaining)
            break

        idx = remaining.rfind("\n", 0, limit)
        if idx < limit // 2:
            idx = limit
        chunks.append(remaining[:idx])
        remaining = remaining[idx:].lstrip("\n")

    return chunks


async def _dispatch_text_chunked(
    dispatch_fn: Callable[[UnifiedOutboundAction], Coroutine],
    *,
    channel: str,
    chat_id: str,
    content: str,
) -> None:
    """Send a long text as multiple send_text actions."""
    for chunk in _split_bot_text(content):
        await dispatch_fn(
            UnifiedOutboundAction(
                channel=channel,
                action="send_text",
                chat_id=chat_id,
                content=chunk,
            )
        )


@dataclass
class TaskResult:
    success: bool = False
    exit_code: int = -1
    log_tail: list[str] = field(default_factory=list)
    generated_files: list[dict[str, Any]] = field(default_factory=list)
    date: str = ""


def is_task_running(chat_id: str) -> bool:
    task = _active_tasks.get(chat_id)
    return task is not None and not task.done()


async def run_pipeline(
    params: RunParams,
    progress_fn: Callable[[str], Coroutine] | None = None,
) -> TaskResult:
    """Run the iDeer pipeline and collect results.

    If progress_fn is provided, key log lines are forwarded in real time.
    """
    from web_server import RunRequest, run_daily_recommender

    req = RunRequest(
        sources=params.sources,
        generate_report=params.generate_report,
        generate_ideas=params.generate_ideas,
        save=True,
        receiver="",  # skip email — bot delivers directly
        delivery_mode="save_only",  # skip all emails; save to history, bot delivers
    )

    result = TaskResult()
    last_progress_time = 0.0

    async with _semaphore:
        async for msg in run_daily_recommender(req):
            msg_type = msg.get("type", "")
            if msg_type == "log":
                line = msg.get("message", "")
                result.log_tail.append(line)
                if len(result.log_tail) > 30:
                    result.log_tail = result.log_tail[-30:]

                # Forward progress lines to user
                if progress_fn and line and _is_progress_line(line):
                    now = time.monotonic()
                    if now - last_progress_time >= _PROGRESS_INTERVAL:
                        last_progress_time = now
                        try:
                            await progress_fn(line)
                        except Exception:
                            pass
            elif msg_type == "complete":
                result.success = msg.get("success", False)
                result.exit_code = msg.get("exit_code", -1)
                result.generated_files = msg.get("files", [])
                result.date = msg.get("date", "")
            elif msg_type == "error":
                result.log_tail.append(f"ERROR: {msg.get('message', '')}")
    return result


def _find_report_file(result: TaskResult) -> str | None:
    """Find the cross-source report HTML file path from generated files."""
    for f in result.generated_files:
        if f.get("type") == "html" and f.get("source") == "reports":
            url = f.get("url", "")
            if url:
                from pathlib import Path
                parts = url.replace("/api/file/", "").split("/")
                if len(parts) >= 3:
                    return str(Path("history") / "/".join(parts))
    if result.date:
        path = f"history/reports/{result.date}/report.html"
        if os.path.exists(path):
            return path
    return None


def _find_all_html_files(result: TaskResult) -> list[tuple[str, str]]:
    """Find all HTML output files. Returns list of (abs_path, display_name)."""
    from pathlib import Path
    found: list[tuple[str, str]] = []
    for f in result.generated_files:
        if f.get("type") != "html":
            continue
        url = f.get("url", "")
        source = f.get("source", "unknown")
        name = f.get("name", "output.html")
        if url:
            parts = url.replace("/api/file/", "").split("/")
            if len(parts) >= 3:
                abs_path = str(Path("history") / "/".join(parts))
                if os.path.exists(abs_path):
                    display = f"{source}_{result.date}_{name}" if result.date else f"{source}_{name}"
                    found.append((abs_path, display))
    return found


def _collect_markdown_summaries(result: TaskResult) -> str:
    """Collect markdown summaries from generated files into a single text."""
    parts: list[str] = []
    for f in result.generated_files:
        if f.get("type") == "markdown" and f.get("content"):
            source = f.get("source", "")
            content = f["content"].strip()
            header = f"【{source}】" if source else ""
            parts.append(f"{header}\n{content}" if header else content)
    if not parts:
        return ""
    return "\n\n" + ("\n\n" + "="*50 + "\n\n").join(parts)


def _collect_html_as_text(result: TaskResult) -> str:
    """Extract text content from HTML files (basic strip of tags)."""
    import re
    parts: list[str] = []
    for f in result.generated_files:
        if f.get("type") != "html":
            continue
        url = f.get("url", "")
        source = f.get("source", "unknown")
        if url:
            file_path = f"history/{url.replace('/api/file/', '')}"
            if os.path.exists(file_path):
                try:
                    html = open(file_path, encoding="utf-8").read()
                    # Strip HTML tags, keep text
                    text = re.sub(r"<[^>]+>", "", html)
                    text = re.sub(r"\s+", " ", text).strip()
                    if text:
                        parts.append(f"【{source}】\n{text}")
                except Exception:
                    pass
    return ("\n\n" + "="*50 + "\n\n").join(parts) if parts else ""


def _read_history_fallback(date: str, sources: list[str]) -> str:
    """Directly read from history/ directory as last resort."""
    import re as _re
    from pathlib import Path
    parts: list[str] = []
    history = Path("history")

    # Check per-source markdown/html
    for src in sources:
        src_dir = history / src / date
        if not src_dir.exists():
            continue
        for md_file in src_dir.glob("*.md"):
            text = md_file.read_text(encoding="utf-8").strip()
            if text:
                parts.append(f"[{src}]\n{text}")
                break
        else:
            for html_file in src_dir.glob("*.html"):
                html = html_file.read_text(encoding="utf-8")
                text = _re.sub(r"<[^>]+>", "", html)
                text = _re.sub(r"\s+", " ", text).strip()
                if text:
                    parts.append(f"[{src}]\n{text}")
                    break

    # Check reports
    report_dir = history / "reports" / date
    if report_dir.exists():
        for md_file in report_dir.glob("*.md"):
            text = md_file.read_text(encoding="utf-8").strip()
            if text:
                parts.append(f"[report]\n{text}")
                break

    return ("\n\n" + "="*50 + "\n\n").join(parts) if parts else ""


def _build_summary(result: TaskResult) -> str:
    """Build a text summary of the pipeline run."""
    if not result.success:
        tail = "\n".join(result.log_tail[-10:]) if result.log_tail else "No logs"
        return f"Pipeline failed (exit code {result.exit_code}).\n\nLast logs:\n{tail}"

    lines = ["Pipeline completed successfully."]
    if result.date:
        lines.append(f"Date: {result.date}")

    # Count items by source
    for f in result.generated_files:
        if f.get("type") == "json_list":
            source = f.get("source", "?")
            count = len(f.get("items", []))
            lines.append(f"  {source}: {count} items")
        elif f.get("type") == "html":
            lines.append(f"  Report: {f.get('name', 'report.html')}")

    return "\n".join(lines)


async def execute_and_reply(
    event: UnifiedInboundEvent,
    params: RunParams,
    dispatch_fn: Callable[[UnifiedOutboundAction], Coroutine],
) -> None:
    """Background coroutine: run pipeline, then send results back via bot."""
    chat_id = event.chat_id
    channel = event.channel

    async def _send_progress(line: str) -> None:
        await _dispatch_text_chunked(
            dispatch_fn,
            channel=channel,
            chat_id=chat_id,
            content=f"[progress] {line}",
        )

    try:
        result = await run_pipeline(params, progress_fn=_send_progress)
        summary = _build_summary(result)

        # Send text summary
        await _dispatch_text_chunked(
            dispatch_fn,
            channel=channel,
            chat_id=chat_id,
            content=summary,
        )

        if result.success:
            # Debug: log what files were generated
            file_types = [(f.get("type"), f.get("source"), f.get("name", "")) for f in result.generated_files]
            print(f"[Bot] Generated files for chat {chat_id}: {file_types}")

            # Send one HTML artifact file back to the chat when available.
            html_files = _find_all_html_files(result)
            if html_files:
                file_path, display_name = html_files[0]
                await dispatch_fn(UnifiedOutboundAction(
                    channel=channel, action="send_file",
                    chat_id=chat_id, file_path=file_path,
                    file_name=display_name,
                ))

            # Send markdown summaries as text
            md_text = _collect_markdown_summaries(result)
            html_text = ""
            if md_text.strip():
                await _dispatch_text_chunked(
                    dispatch_fn,
                    channel=channel,
                    chat_id=chat_id,
                    content=md_text,
                )
            else:
                # Fallback: extract text from HTML reports
                html_text = _collect_html_as_text(result)
                if html_text.strip():
                    await _dispatch_text_chunked(
                        dispatch_fn,
                        channel=channel,
                        chat_id=chat_id,
                        content=html_text,
                    )

            # Last resort: scan history directory directly
            if not md_text.strip() and not html_text.strip() and result.date:
                disk_text = _read_history_fallback(result.date, params.sources)
                if disk_text.strip():
                    await _dispatch_text_chunked(
                        dispatch_fn,
                        channel=channel,
                        chat_id=chat_id,
                        content=disk_text,
                    )
    except Exception as e:
        print(f"[Bot] Task error for chat {chat_id}: {e}")
        try:
            await _dispatch_text_chunked(
                dispatch_fn,
                channel=channel,
                chat_id=chat_id,
                content=f"Task failed: {e}",
            )
        except Exception:
            pass
    finally:
        _active_tasks.pop(chat_id, None)


def spawn_task(
    event: UnifiedInboundEvent,
    params: RunParams,
    dispatch_fn: Callable[[UnifiedOutboundAction], Coroutine],
) -> None:
    """Spawn a background asyncio task for the pipeline run."""
    task = asyncio.create_task(execute_and_reply(event, params, dispatch_fn))
    _active_tasks[event.chat_id] = task
