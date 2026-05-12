"""Fetch generic RSS/Atom feeds for iDeer daily digests."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from typing import Any
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

DEFAULT_RSS_URLS = ["https://imjuya.github.io/juya-ai-daily/rss.xml"]
DEFAULT_TIMEOUT = 20
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (iDeer-daily-recommender; +https://github.com/LiYu0524/iDeer)"
}


def fetch_rss_feeds(
    urls: list[str] | None = None,
    max_items: int = 30,
    timeout: int = DEFAULT_TIMEOUT,
) -> list[dict[str, Any]]:
    """Fetch multiple RSS/Atom feeds and return de-duplicated items."""
    feed_urls = _dedupe_urls(urls or DEFAULT_RSS_URLS)
    items: list[dict[str, Any]] = []
    seen_items: set[str] = set()

    for feed_url in feed_urls:
        try:
            resp = requests.get(feed_url, headers=_HEADERS, timeout=timeout)
            resp.raise_for_status()
        except Exception as exc:
            print(f"[rss] Fetch failed for {feed_url}: {exc}")
            continue

        parsed_items = parse_rss_feed(resp.text, feed_url=feed_url)
        print(f"[rss] {len(parsed_items)} items fetched from {feed_url}")
        for item in parsed_items:
            key = item.get("url") or item.get("cache_id") or item.get("title")
            if not key or key in seen_items:
                continue
            seen_items.add(key)
            items.append(item)
            if len(items) >= max_items:
                return items

    return items


def parse_rss_feed(
    xml_text: str,
    feed_url: str = "",
    source_label: str = "",
) -> list[dict[str, Any]]:
    """Parse RSS 2.0 or Atom XML into iDeer item dictionaries."""
    root = ET.fromstring(xml_text)
    channel = _find_first(root, "channel")
    inferred_label = source_label or _find_child_text(channel or root, "title") or _label_from_url(feed_url)

    if channel is not None:
        raw_items = _find_children(channel, "item")
    else:
        raw_items = _find_children(root, "entry")

    items: list[dict[str, Any]] = []
    for raw in raw_items:
        title = _strip_html(_find_child_text(raw, "title")) or "Untitled"
        link = _extract_link(raw)
        guid = _find_child_text(raw, "guid", "id") or link or title
        published_at = _find_child_text(raw, "pubDate", "published", "updated", "date")
        html_content = (
            _find_child_text(raw, "encoded")
            or _find_child_text(raw, "content")
            or _find_child_text(raw, "description", "summary")
        )
        summary = _strip_html(html_content)

        cache_basis = guid or link or title
        items.append(
            {
                "title": title,
                "url": link,
                "summary": summary,
                "abstract": summary,
                "published_at": published_at,
                "feed_url": feed_url,
                "source_label": inferred_label,
                "cache_id": "rss_" + _safe_cache_id(cache_basis),
            }
        )

    return items


def _dedupe_urls(urls: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for url in urls:
        normalized = str(url or "").strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        unique.append(normalized)
    return unique


def _local_name(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[1]
    return tag.split(":")[-1]


def _find_first(element: ET.Element | None, name: str) -> ET.Element | None:
    if element is None:
        return None
    for child in list(element):
        if _local_name(child.tag) == name:
            return child
    for child in element.iter():
        if _local_name(child.tag) == name:
            return child
    return None


def _find_children(element: ET.Element, name: str) -> list[ET.Element]:
    return [child for child in element.iter() if _local_name(child.tag) == name]


def _find_child_text(element: ET.Element | None, *names: str) -> str:
    if element is None:
        return ""
    wanted = set(names)
    for child in list(element):
        if _local_name(child.tag) in wanted:
            return "".join(child.itertext()).strip()
    return ""


def _extract_link(element: ET.Element) -> str:
    text_link = _find_child_text(element, "link")
    if text_link:
        return text_link
    for child in list(element):
        if _local_name(child.tag) == "link":
            href = child.attrib.get("href", "").strip()
            if href:
                return href
    return ""


def _strip_html(text: str) -> str:
    if not text:
        return ""
    return BeautifulSoup(text, "html.parser").get_text(" ", strip=True)


def _label_from_url(url: str) -> str:
    hostname = urlparse(url).hostname or "RSS"
    return hostname


def _safe_cache_id(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", str(value)).strip("_")
    return cleaned[:100] or "unknown"


if __name__ == "__main__":
    import json

    results = fetch_rss_feeds(DEFAULT_RSS_URLS, max_items=10)
    print(json.dumps(results, indent=2, ensure_ascii=False))
