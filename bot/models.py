"""Unified inbound/outbound event models for bot integrations."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel


class UnifiedInboundEvent(BaseModel):
    channel: Literal["telegram", "feishu"]
    event_id: str
    chat_id: str
    sender_id: str
    sender_name: str | None = None
    text: str = ""
    raw_event: dict[str, Any] = {}


class UnifiedOutboundAction(BaseModel):
    channel: Literal["telegram", "feishu"]
    action: Literal["send_text", "send_file"]
    chat_id: str
    content: str | None = None
    file_path: str | None = None
    file_name: str | None = None
    reply_to_message_id: str | None = None
