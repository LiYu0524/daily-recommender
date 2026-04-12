"""Bot configuration loaded from BOT_* environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass
class BotConfig:
    # Telegram
    telegram_enabled: bool = False
    telegram_token: str = ""
    telegram_webhook_secret: str = ""

    # Feishu
    feishu_enabled: bool = False
    feishu_app_id: str = ""
    feishu_app_secret: str = ""
    feishu_verification_token: str = ""
    feishu_encrypt_key: str = ""

    # Common
    rate_limit_rps: int = 5
    max_body_bytes: int = 1_048_576
    allowed_chat_ids: set[str] = field(default_factory=set)


def load_bot_config() -> BotConfig:
    """Read BOT_* env vars and return a BotConfig instance."""
    from core.config import load_dotenv
    load_dotenv()

    def _bool(key: str) -> bool:
        return os.getenv(key, "0").strip() in ("1", "true", "yes")

    allowed_raw = os.getenv("BOT_ALLOW_FROM", "").strip()
    allowed = {s.strip() for s in allowed_raw.split(",") if s.strip()} if allowed_raw else set()

    return BotConfig(
        telegram_enabled=_bool("BOT_TELEGRAM_ENABLED"),
        telegram_token=os.getenv("BOT_TELEGRAM_TOKEN", "").strip(),
        telegram_webhook_secret=os.getenv("BOT_TELEGRAM_WEBHOOK_SECRET", "").strip(),
        feishu_enabled=_bool("BOT_FEISHU_ENABLED"),
        feishu_app_id=os.getenv("BOT_FEISHU_APP_ID", "").strip(),
        feishu_app_secret=os.getenv("BOT_FEISHU_APP_SECRET", "").strip(),
        feishu_verification_token=os.getenv("BOT_FEISHU_VERIFICATION_TOKEN", "").strip(),
        feishu_encrypt_key=os.getenv("BOT_FEISHU_ENCRYPT_KEY", "").strip(),
        rate_limit_rps=int(os.getenv("BOT_RATE_LIMIT_RPS", "5")),
        max_body_bytes=int(os.getenv("BOT_MAX_BODY_BYTES", "1048576")),
        allowed_chat_ids=allowed,
    )
