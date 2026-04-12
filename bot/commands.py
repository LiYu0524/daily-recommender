"""Command parser and handlers for bot interactions."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from bot.models import UnifiedInboundEvent, UnifiedOutboundAction
from sources import SOURCE_REGISTRY

VALID_SOURCES = set(SOURCE_REGISTRY.keys())

HELP_TEXT = (
    "iDeer Bot Commands\n"
    "\n"
    "/help - Show this help message\n"
    "/status - Show current configuration and last run info\n"
    "/run <sources> - Run pipeline for specified sources\n"
    "  e.g. /run arxiv github\n"
    "/report - Run all sources and generate cross-source report\n"
    "/ideas - Run all sources and generate research ideas\n"
    "/set_description <text> - Set your interest description\n"
    "/get_description - Show current interest description\n"
    "\n"
    "Available sources: " + ", ".join(sorted(VALID_SOURCES))
)


@dataclass
class RunParams:
    sources: list[str]
    generate_report: bool = False
    generate_ideas: bool = False


def parse_command(text: str) -> tuple[str | None, list[str]]:
    """Parse '/command arg1 arg2' -> ('command', ['arg1', 'arg2']).

    Returns (None, []) if text is not a command.
    Handles Telegram-style /command@botname.
    """
    if not text or not text.startswith("/"):
        return None, []
    parts = text.split()
    cmd = parts[0].split("@")[0].lower()  # strip @botname suffix
    return cmd, parts[1:]


async def handle_help(event: UnifiedInboundEvent) -> list[UnifiedOutboundAction]:
    return [UnifiedOutboundAction(
        channel=event.channel, action="send_text",
        chat_id=event.chat_id, content=HELP_TEXT,
    )]


async def handle_status(event: UnifiedInboundEvent) -> list[UnifiedOutboundAction]:
    from web_server import load_config_data
    config = load_config_data()
    lines = [
        "iDeer Status",
        f"Model: {config.get('provider', '?')}/{config.get('model', '?')}",
        f"Email: {'configured' if config.get('smtp_server') else 'not configured'}",
        f"Schedule: {'enabled' if config.get('schedule_enabled') else 'disabled'}",
    ]
    if config.get("schedule_enabled"):
        lines.append(
            f"  {config.get('schedule_frequency', 'daily')} @ {config.get('schedule_time', '?')}"
            f" - sources: {', '.join(config.get('schedule_sources', []))}"
        )
    lines.append(f"Available sources: {', '.join(sorted(VALID_SOURCES))}")
    return [UnifiedOutboundAction(
        channel=event.channel, action="send_text",
        chat_id=event.chat_id, content="\n".join(lines),
    )]


async def handle_set_description(
    event: UnifiedInboundEvent, args: list[str],
) -> list[UnifiedOutboundAction]:
    """Set profiles/description.txt from bot message."""
    if not args:
        return [UnifiedOutboundAction(
            channel=event.channel, action="send_text",
            chat_id=event.chat_id,
            content="Usage: /set_description <your interest description>\n\n"
                    "Example:\n"
                    "/set_description I am interested in LLM agents, "
                    "multimodal reasoning, and code generation.",
        )]

    from pathlib import Path
    description = " ".join(args).strip()
    desc_path = Path("profiles/description.txt")
    desc_path.parent.mkdir(parents=True, exist_ok=True)
    desc_path.write_text(description + "\n", encoding="utf-8")

    preview = description[:200] + ("..." if len(description) > 200 else "")
    return [UnifiedOutboundAction(
        channel=event.channel, action="send_text",
        chat_id=event.chat_id,
        content=f"Description updated ({len(description)} chars):\n{preview}",
    )]


async def handle_get_description(
    event: UnifiedInboundEvent,
) -> list[UnifiedOutboundAction]:
    """Show current profiles/description.txt."""
    from pathlib import Path
    desc_path = Path("profiles/description.txt")
    if not desc_path.exists():
        content = "No description set. Use /set_description to set one."
    else:
        text = desc_path.read_text(encoding="utf-8").strip()
        content = text if text else "Description file is empty. Use /set_description to set one."
    return [UnifiedOutboundAction(
        channel=event.channel, action="send_text",
        chat_id=event.chat_id, content=content,
    )]


def _validate_sources(args: list[str]) -> tuple[list[str], str | None]:
    """Validate source names. Returns (valid_sources, error_message)."""
    if not args:
        return [], "Please specify sources. Available: " + ", ".join(sorted(VALID_SOURCES))
    invalid = [s for s in args if s.lower() not in VALID_SOURCES]
    if invalid:
        return [], f"Unknown sources: {', '.join(invalid)}. Available: {', '.join(sorted(VALID_SOURCES))}"
    return [s.lower() for s in args], None


async def route_command(
    event: UnifiedInboundEvent,
) -> tuple[list[UnifiedOutboundAction], RunParams | None]:
    """Main entry point. Returns (ack_actions, run_params_or_None).

    If run_params is not None, the caller should spawn a background task.
    """
    cmd, args = parse_command(event.text)

    if cmd == "/help" or cmd == "/start":
        return await handle_help(event), None

    if cmd == "/status":
        return await handle_status(event), None

    if cmd == "/set_description":
        return await handle_set_description(event, args), None

    if cmd == "/get_description":
        return await handle_get_description(event), None

    if cmd == "/run":
        sources, err = _validate_sources(args)
        if err:
            return [UnifiedOutboundAction(
                channel=event.channel, action="send_text",
                chat_id=event.chat_id, content=err,
            )], None
        ack = UnifiedOutboundAction(
            channel=event.channel, action="send_text",
            chat_id=event.chat_id,
            content=f"Starting pipeline for: {', '.join(sources)}...",
        )
        return [ack], RunParams(sources=sources)

    if cmd == "/report":
        sources = list(VALID_SOURCES)
        ack = UnifiedOutboundAction(
            channel=event.channel, action="send_text",
            chat_id=event.chat_id,
            content=f"Generating cross-source report ({', '.join(sorted(sources))})...",
        )
        return [ack], RunParams(sources=sources, generate_report=True)

    if cmd == "/ideas":
        sources = list(VALID_SOURCES)
        ack = UnifiedOutboundAction(
            channel=event.channel, action="send_text",
            chat_id=event.chat_id,
            content=f"Generating research ideas ({', '.join(sorted(sources))})...",
        )
        return [ack], RunParams(sources=sources, generate_ideas=True)

    # Unknown command or plain text
    if cmd:
        return [UnifiedOutboundAction(
            channel=event.channel, action="send_text",
            chat_id=event.chat_id,
            content=f"Unknown command: {cmd}\nType /help for available commands.",
        )], None

    return [], None
