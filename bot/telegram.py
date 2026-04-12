"""Telegram adapter: parse webhook updates and send messages via Bot API."""

from __future__ import annotations

import json
from typing import Any

import httpx

from bot.models import UnifiedInboundEvent, UnifiedOutboundAction

TELEGRAM_API = "https://api.telegram.org/bot{token}"
MAX_TEXT_LENGTH = 4096


def parse_telegram_update(body: dict[str, Any]) -> UnifiedInboundEvent | None:
    """Convert a Telegram Update JSON into a UnifiedInboundEvent.

    Returns None for updates without a text message (photos, stickers, etc.).
    """
    msg = body.get("message") or body.get("edited_message")
    if not msg or "text" not in msg:
        return None

    chat = msg.get("chat", {})
    sender = msg.get("from", {})
    update_id = body.get("update_id", "")

    return UnifiedInboundEvent(
        channel="telegram",
        event_id=str(update_id),
        chat_id=str(chat.get("id", "")),
        sender_id=str(sender.get("id", "")),
        sender_name=sender.get("first_name") or sender.get("username"),
        text=msg.get("text", "").strip(),
        raw_event=body,
    )


async def send_telegram_text(
    token: str, chat_id: str, text: str, reply_to: str | None = None,
) -> None:
    """Send a text message via Telegram Bot API. Splits long messages."""
    base = TELEGRAM_API.format(token=token)
    chunks = _split_text(text, MAX_TEXT_LENGTH)

    async with httpx.AsyncClient(timeout=30) as client:
        for chunk in chunks:
            payload: dict[str, Any] = {
                "chat_id": chat_id,
                "text": chunk,
            }
            if reply_to:
                payload["reply_to_message_id"] = reply_to
                reply_to = None  # only reply to the first chunk
            resp = await client.post(f"{base}/sendMessage", json=payload)
            if resp.status_code != 200:
                print(f"[Telegram] sendMessage failed: {resp.status_code} {resp.text}")


async def send_telegram_file(
    token: str, chat_id: str, file_path: str, file_name: str, caption: str = "",
) -> None:
    """Send a document via Telegram Bot API."""
    base = TELEGRAM_API.format(token=token)
    lower_name = file_name.lower()
    mime_type = "application/octet-stream"
    file_payload: Any

    if lower_name.endswith(".html") or lower_name.endswith(".htm"):
        mime_type = "text/html; charset=utf-8"
        with open(file_path, "rb") as rf:
            raw = rf.read()
        # Prefix UTF-8 BOM so Telegram preview decodes Chinese reliably.
        if not raw.startswith(b"\xef\xbb\xbf"):
            raw = b"\xef\xbb\xbf" + raw
        file_payload = raw
    elif lower_name.endswith(".md"):
        mime_type = "text/markdown; charset=utf-8"
        with open(file_path, "rb") as rf:
            file_payload = rf.read()
    else:
        with open(file_path, "rb") as rf:
            file_payload = rf.read()

    async with httpx.AsyncClient(timeout=60) as client:
        files = {"document": (file_name, file_payload, mime_type)}
        data: dict[str, Any] = {"chat_id": chat_id}
        if caption:
            data["caption"] = caption[:1024]
        resp = await client.post(f"{base}/sendDocument", data=data, files=files)
        if resp.status_code != 200:
            print(f"[Telegram] sendDocument failed: {resp.status_code} {resp.text}")


async def dispatch_telegram_action(token: str, action: UnifiedOutboundAction) -> None:
    """Route a UnifiedOutboundAction to the appropriate Telegram send function."""
    if action.action == "send_text" and action.content:
        await send_telegram_text(
            token, action.chat_id, action.content, action.reply_to_message_id,
        )
    elif action.action == "send_file" and action.file_path:
        await send_telegram_file(
            token, action.chat_id, action.file_path,
            action.file_name or "report.html",
        )


def _split_text(text: str, limit: int) -> list[str]:
    """Split text into chunks respecting the character limit."""
    if len(text) <= limit:
        return [text]
    chunks: list[str] = []
    while text:
        if len(text) <= limit:
            chunks.append(text)
            break
        # Try to split at a newline
        idx = text.rfind("\n", 0, limit)
        if idx < limit // 2:
            idx = limit
        chunks.append(text[:idx])
        text = text[idx:].lstrip("\n")
    return chunks
