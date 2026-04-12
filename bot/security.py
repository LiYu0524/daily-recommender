"""Security utilities: secret verification, signature checking, rate limiting."""

from __future__ import annotations

import hashlib
import hmac
import time
from collections import defaultdict


def verify_telegram_secret(header_value: str | None, expected_secret: str) -> bool:
    """Constant-time comparison of Telegram webhook secret header."""
    if not header_value or not expected_secret:
        return False
    return hmac.compare_digest(header_value.encode(), expected_secret.encode())


def verify_feishu_signature(
    timestamp: str, nonce: str, encrypt_key: str, raw_body: bytes, signature: str,
) -> bool:
    """Verify Feishu webhook signature: SHA256(timestamp + nonce + encrypt_key + body)."""
    if not encrypt_key or not signature:
        return False
    payload = timestamp.encode() + nonce.encode() + encrypt_key.encode() + raw_body
    computed = hashlib.sha256(payload).hexdigest()
    return hmac.compare_digest(computed, signature)


class RateLimiter:
    """Simple sliding-window rate limiter keyed by arbitrary string."""

    def __init__(self, max_requests: int = 5, window_seconds: float = 1.0):
        self._max = max_requests
        self._window = window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)

    def check(self, key: str) -> bool:
        """Return True if the request is allowed, False if rate-limited."""
        now = time.monotonic()
        cutoff = now - self._window
        timestamps = self._hits[key]
        self._hits[key] = [t for t in timestamps if t > cutoff]
        if len(self._hits[key]) >= self._max:
            return False
        self._hits[key].append(now)
        return True
