"""Bot integration package for Telegram and Feishu."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI


def setup_bot_routes(app: FastAPI) -> None:
    """Mount bot webhook routes on the FastAPI app if any bot is enabled."""
    from bot.config import load_bot_config
    from bot.router import setup

    config = load_bot_config()
    if not config.telegram_enabled and not config.feishu_enabled:
        return

    router = setup(config)
    app.include_router(router)

    channels = []
    if config.telegram_enabled:
        channels.append("Telegram")
    if config.feishu_enabled:
        channels.append("Feishu")
    print(f"[Bot] Routes mounted for: {', '.join(channels)}")
