import argparse
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


SAMPLE_RSS = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Juya AI Daily</title>
    <item>
      <title>Agent Safety Weekly</title>
      <link>https://example.com/agent-safety</link>
      <guid>agent-safety-guid</guid>
      <pubDate>Tue, 12 May 2026 05:00:00 GMT</pubDate>
      <description><![CDATA[<p>Short <strong>AI safety</strong> note.</p>]]></description>
      <content:encoded><![CDATA[<article>Longer agent safety analysis.</article>]]></content:encoded>
    </item>
    <item>
      <title>Model Ecosystem Update</title>
      <link>https://example.com/model-update</link>
      <description>Plain text update.</description>
    </item>
  </channel>
</rss>
"""


class RssFetcherTest(unittest.TestCase):
    def test_parse_rss_feed_extracts_items_and_strips_html(self):
        from fetchers.rss_fetcher import parse_rss_feed

        items = parse_rss_feed(
            SAMPLE_RSS,
            feed_url="https://imjuya.github.io/juya-ai-daily/rss.xml",
            source_label="Juya AI Daily",
        )

        self.assertEqual(len(items), 2)
        first = items[0]
        self.assertEqual(first["title"], "Agent Safety Weekly")
        self.assertEqual(first["url"], "https://example.com/agent-safety")
        self.assertEqual(first["feed_url"], "https://imjuya.github.io/juya-ai-daily/rss.xml")
        self.assertEqual(first["source_label"], "Juya AI Daily")
        self.assertEqual(first["published_at"], "Tue, 12 May 2026 05:00:00 GMT")
        self.assertEqual(first["summary"], "Longer agent safety analysis.")
        self.assertIn("agent-safety-guid", first["cache_id"])

    def test_fetch_rss_feeds_uses_juya_default_and_deduplicates_items(self):
        from fetchers.rss_fetcher import DEFAULT_RSS_URLS, fetch_rss_feeds

        class Response:
            text = SAMPLE_RSS

            def raise_for_status(self):
                return None

        self.assertIn("https://imjuya.github.io/juya-ai-daily/rss.xml", DEFAULT_RSS_URLS)

        with patch("fetchers.rss_fetcher.requests.get", return_value=Response()) as get:
            items = fetch_rss_feeds(
                [
                    "https://imjuya.github.io/juya-ai-daily/rss.xml",
                    "https://imjuya.github.io/juya-ai-daily/rss.xml",
                ],
                max_items=1,
            )

        self.assertEqual(get.call_count, 1)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["title"], "Agent Safety Weekly")


class RssIntegrationTest(unittest.TestCase):
    def test_rss_source_is_registered(self):
        from sources import SOURCE_REGISTRY

        self.assertIn("rss", SOURCE_REGISTRY)

    def test_agent_bridge_fetches_rss(self):
        from pipeline.agent_bridge import _run_fetcher

        expected = [{"title": "Agent Safety Weekly", "url": "https://example.com/agent-safety"}]
        args = argparse.Namespace(
            source="rss",
            rss_urls=["https://imjuya.github.io/juya-ai-daily/rss.xml"],
            max=3,
        )

        with patch("fetchers.rss_fetcher.fetch_rss_feeds", return_value=expected) as fetch:
            items = _run_fetcher(args)

        fetch.assert_called_once_with(
            ["https://imjuya.github.io/juya-ai-daily/rss.xml"],
            max_items=3,
        )
        self.assertEqual(items, expected)

    def test_first_run_setup_writes_rss_default(self):
        script = ROOT / "skills/ideer-daily-paper-chatbot/scripts/setup_chatbot_config.py"
        payload = {
            "receiver": "reader@example.com",
            "description": "AI agents and safety",
        }

        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(
                [sys.executable, str(script), "--repo-root", tmp],
                input=json.dumps(payload),
                text=True,
                check=True,
                capture_output=True,
            )
            env_text = (Path(tmp) / ".env").read_text(encoding="utf-8")
            setup = json.loads((Path(tmp) / "state/ideer_chatbot_setup.json").read_text(encoding="utf-8"))

        self.assertIn("DAILY_SOURCES='arxiv semanticscholar huggingface rss'", env_text)
        self.assertIn("RSS_URLS=https://imjuya.github.io/juya-ai-daily/rss.xml", env_text)
        self.assertEqual(setup["sources"], ["arxiv", "semanticscholar", "huggingface", "rss"])
        self.assertEqual(setup["rss_urls"], ["https://imjuya.github.io/juya-ai-daily/rss.xml"])


if __name__ == "__main__":
    unittest.main()
