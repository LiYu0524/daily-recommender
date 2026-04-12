"""FastAPI webhook routes for Telegram and Feishu bots."""

from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from bot.config import BotConfig
from bot.models import UnifiedOutboundAction

router = APIRouter(prefix="/bot", tags=["bot"])

# Module-level state, initialized by setup()
_config: BotConfig | None = None
_feishu_client: Any = None
_rate_limiter: Any = None
_seen_events: dict[str, float] = {}


def setup(bot_config: BotConfig) -> APIRouter:
    """Initialize bot state and return the configured router."""
    global _config, _feishu_client, _rate_limiter

    from bot.security import RateLimiter

    _config = bot_config
    _rate_limiter = RateLimiter(max_requests=bot_config.rate_limit_rps)

    if bot_config.feishu_enabled and bot_config.feishu_app_id:
        from bot.feishu import FeishuClient
        _feishu_client = FeishuClient(bot_config.feishu_app_id, bot_config.feishu_app_secret)

    return router


def _is_duplicate(event_id: str) -> bool:
    """Check and record event_id for dedup. TTL = 5 minutes."""
    now = time.time()
    # Lazy cleanup
    stale = [k for k, v in _seen_events.items() if now - v > 300]
    for k in stale:
        del _seen_events[k]

    if event_id in _seen_events:
        return True
    _seen_events[event_id] = now
    return False


def _check_allowed(chat_id: str) -> bool:
    """Check if chat_id is in the allowlist (empty = allow all)."""
    if not _config or not _config.allowed_chat_ids:
        return True
    return chat_id in _config.allowed_chat_ids


@router.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    """Handle Telegram Bot webhook updates."""
    if not _config or not _config.telegram_enabled:
        return PlainTextResponse("Not enabled", status_code=404)

    # Rate limit
    client_ip = request.client.host if request.client else "unknown"
    if _rate_limiter and not _rate_limiter.check(client_ip):
        return PlainTextResponse("Rate limited", status_code=429)

    # Verify secret
    from bot.security import verify_telegram_secret
    secret_header = request.headers.get("x-telegram-bot-api-secret-token")
    if _config.telegram_webhook_secret:
        if not verify_telegram_secret(secret_header, _config.telegram_webhook_secret):
            return PlainTextResponse("Unauthorized", status_code=401)

    # Read body with size limit
    body_bytes = await request.body()
    if len(body_bytes) > _config.max_body_bytes:
        return PlainTextResponse("Payload too large", status_code=413)

    import json
    try:
        body = json.loads(body_bytes)
    except (json.JSONDecodeError, ValueError):
        return PlainTextResponse("Bad request", status_code=400)

    # Parse update
    from bot.telegram import parse_telegram_update, dispatch_telegram_action
    event = parse_telegram_update(body)
    if not event:
        return JSONResponse({"ok": True})

    # Dedup
    if _is_duplicate(event.event_id):
        return JSONResponse({"ok": True})

    # Allowlist check
    if not _check_allowed(event.chat_id):
        return JSONResponse({"ok": True})

    # Route command
    from bot.commands import route_command
    from bot.task_runner import is_task_running, spawn_task
    from functools import partial

    ack_actions, run_params = await route_command(event)

    dispatch = partial(dispatch_telegram_action, _config.telegram_token)

    # Send ack messages
    for action in ack_actions:
        await dispatch(action)

    # Spawn background task if needed
    if run_params:
        if is_task_running(event.chat_id):
            await dispatch(UnifiedOutboundAction(
                channel="telegram", action="send_text",
                chat_id=event.chat_id,
                content="A task is already running for this chat. Please wait.",
            ))
        else:
            spawn_task(event, run_params, dispatch)
    return JSONResponse({"ok": True})


@router.post("/feishu/webhook")
async def feishu_webhook(request: Request):
    """Handle Feishu Bot webhook events."""
    if not _config or not _config.feishu_enabled:
        return PlainTextResponse("Not enabled", status_code=404)

    # Rate limit
    client_ip = request.client.host if request.client else "unknown"
    if _rate_limiter and not _rate_limiter.check(client_ip):
        return PlainTextResponse("Rate limited", status_code=429)

    # Read raw body
    raw_body = await request.body()
    if len(raw_body) > _config.max_body_bytes:
        return PlainTextResponse("Payload too large", status_code=413)

    # Verify signature (if encrypt_key is configured)
    if _config.feishu_encrypt_key:
        from bot.security import verify_feishu_signature
        ts = request.headers.get("x-lark-request-timestamp", "")
        nonce = request.headers.get("x-lark-request-nonce", "")
        sig = request.headers.get("x-lark-signature", "")
        if not verify_feishu_signature(ts, nonce, _config.feishu_encrypt_key, raw_body, sig):
            return PlainTextResponse("Unauthorized", status_code=401)

    import json
    try:
        body = json.loads(raw_body)
    except (json.JSONDecodeError, ValueError):
        return PlainTextResponse("Bad request", status_code=400)

    # Handle URL verification challenge
    from bot.feishu import is_feishu_challenge, make_challenge_response, parse_feishu_event, dispatch_feishu_action
    if is_feishu_challenge(body):
        return JSONResponse(make_challenge_response(body))

    # Parse event
    event = parse_feishu_event(body)
    if not event:
        return JSONResponse({"ok": True})

    # Dedup
    if _is_duplicate(event.event_id):
        return JSONResponse({"ok": True})

    # Allowlist check
    if not _check_allowed(event.chat_id):
        return JSONResponse({"ok": True})

    # Route command
    from bot.commands import route_command
    from bot.task_runner import is_task_running, spawn_task
    from functools import partial

    ack_actions, run_params = await route_command(event)

    dispatch = partial(dispatch_feishu_action, _feishu_client)

    for action in ack_actions:
        await dispatch(action)

    if run_params:
        if is_task_running(event.chat_id):
            await dispatch(UnifiedOutboundAction(
                channel="feishu", action="send_text",
                chat_id=event.chat_id,
                content="A task is already running for this chat. Please wait.",
            ))
        else:
            spawn_task(event, run_params, dispatch)

    return JSONResponse({"ok": True})


@router.get("/health")
async def bot_health():
    """Return bot status."""
    from bot.task_runner import _active_tasks
    active = sum(1 for t in _active_tasks.values() if not t.done())
    return {
        "telegram_enabled": bool(_config and _config.telegram_enabled),
        "feishu_enabled": bool(_config and _config.feishu_enabled),
        "active_tasks": active,
    }
