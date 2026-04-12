"""Feishu adapter: parse webhook events and send messages via Open API."""

from __future__ import annotations

import json
import time
from typing import Any

import httpx

from bot.models import UnifiedInboundEvent, UnifiedOutboundAction

FEISHU_API = "https://open.feishu.cn/open-apis"


class FeishuClient:
    """Manages tenant_access_token lifecycle and message sending."""

    def __init__(self, app_id: str, app_secret: str):
        self._app_id = app_id
        self._app_secret = app_secret
        self._token: str = ""
        self._token_expires: float = 0

    async def _ensure_token(self) -> str:
        if self._token and time.time() < self._token_expires - 300:
            return self._token
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{FEISHU_API}/auth/v3/tenant_access_token/internal",
                json={"app_id": self._app_id, "app_secret": self._app_secret},
            )
            data = resp.json()
            self._token = data.get("tenant_access_token", "")
            expire = data.get("expire", 7200)
            self._token_expires = time.time() + expire
        return self._token

    async def send_text(
        self, chat_id: str, text: str, reply_to: str | None = None,
    ) -> dict:
        token = await self._ensure_token()
        headers = {"Authorization": f"Bearer {token}"}
        payload: dict[str, Any] = {
            "receive_id": chat_id,
            "msg_type": "text",
            "content": json.dumps({"text": text}),
        }
        if reply_to:
            payload["reply_in_thread"] = False

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{FEISHU_API}/im/v1/messages",
                params={"receive_id_type": "chat_id"},
                headers=headers,
                json=payload,
            )
            result = resp.json()
            if resp.status_code != 200 or result.get("code", -1) != 0:
                print(f"[Feishu] send_text failed: {resp.status_code} {result}")
            return result

    async def send_file(
        self, chat_id: str, file_path: str, file_name: str,
    ) -> dict:
        """Upload file then send as file message."""
        token = await self._ensure_token()
        headers = {"Authorization": f"Bearer {token}"}

        # Upload file
        async with httpx.AsyncClient(timeout=60) as client:
            with open(file_path, "rb") as f:
                resp = await client.post(
                    f"{FEISHU_API}/im/v1/files",
                    headers=headers,
                    data={"file_type": "stream", "file_name": file_name},
                    files={"file": (file_name, f)},
                )
                upload_result = resp.json()
                file_key = upload_result.get("data", {}).get("file_key", "")

            if not file_key:
                print(f"[Feishu] file upload failed: {upload_result}")
                return upload_result

            # Send file message
            payload = {
                "receive_id": chat_id,
                "msg_type": "file",
                "content": json.dumps({"file_key": file_key}),
            }
            resp = await client.post(
                f"{FEISHU_API}/im/v1/messages",
                params={"receive_id_type": "chat_id"},
                headers=headers,
                json=payload,
            )
            result = resp.json()
            if resp.status_code != 200 or result.get("code", -1) != 0:
                print(f"[Feishu] send_file failed: {resp.status_code} {result}")
            return result


def parse_feishu_event(body: dict[str, Any]) -> UnifiedInboundEvent | None:
    """Convert a Feishu im.message.receive_v1 event into a UnifiedInboundEvent."""
    header = body.get("header", {})
    event = body.get("event", {})
    message = event.get("message", {})
    sender = event.get("sender", {}).get("sender_id", {})

    msg_type = message.get("message_type", "")
    if msg_type != "text":
        return None

    content_str = message.get("content", "{}")
    try:
        content = json.loads(content_str)
    except (json.JSONDecodeError, TypeError):
        return None

    text = content.get("text", "").strip()
    # Strip @mention prefix (Feishu includes @_user_1 etc.)
    if text.startswith("@"):
        parts = text.split(None, 1)
        text = parts[1] if len(parts) > 1 else ""

    return UnifiedInboundEvent(
        channel="feishu",
        event_id=header.get("event_id", ""),
        chat_id=message.get("chat_id", ""),
        sender_id=sender.get("open_id", ""),
        sender_name=None,
        text=text,
        raw_event=body,
    )


def is_feishu_challenge(body: dict[str, Any]) -> bool:
    return "challenge" in body


def make_challenge_response(body: dict[str, Any]) -> dict[str, str]:
    return {"challenge": body["challenge"]}


async def dispatch_feishu_action(
    client: FeishuClient, action: UnifiedOutboundAction,
) -> None:
    """Route a UnifiedOutboundAction to the appropriate Feishu send method."""
    if action.action == "send_text" and action.content:
        await client.send_text(
            action.chat_id, action.content, action.reply_to_message_id,
        )
    elif action.action == "send_file" and action.file_path:
        await client.send_file(
            action.chat_id, action.file_path,
            action.file_name or "report.html",
        )
