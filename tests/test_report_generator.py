import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.config import CommonConfig, LLMConfig
from pipeline.report_generator import ReportGenerator


class QueueModel:
    def __init__(self, responses):
        self.responses = list(responses)
        self.prompts = []

    def inference(self, prompt, temperature=0.7):
        self.prompts.append(prompt)
        if not self.responses:
            raise AssertionError("No mock response left for QueueModel")
        return self.responses.pop(0)


def sample_recommendations():
    return {
        "github": [
            {
                "title": "agentscope-ai/ReMe",
                "repo_name": "agentscope-ai/ReMe",
                "summary": "A high-signal repository for agent memory control.",
                "description": "Memory editing and control for agents.",
                "url": "https://github.com/agentscope-ai/ReMe",
                "language": "Python",
                "highlights": ["agent memory", "control", "safety"],
                "score": 8.8,
                "stars": 1200,
                "stars_today": 140,
                "forks": 90,
            }
        ],
        "huggingface": [
            {
                "title": "A strong paper on agent robustness",
                "id": "paper-123",
                "summary": "Paper signal worth tracking.",
                "abstract": "Agent robustness under long-horizon workflows.",
                "url": "https://huggingface.co/papers/123",
                "_hf_type": "paper",
                "score": 8.1,
                "upvotes": 210,
            }
        ],
        "twitter": [
            {
                "title": "Thread on agent evals",
                "author_name": "Researcher",
                "author_username": "evals_lab",
                "summary": "A concise thread about agent evaluation priorities.",
                "text": "Agent evaluation needs better environment realism.",
                "url": "https://x.com/evals_lab/status/1",
                "created_at": "2026-04-13T10:00:00+00:00",
                "score": 7.9,
                "likes": 200,
                "retweets": 50,
                "replies": 12,
            }
        ],
    }


class ReportGeneratorTest(unittest.TestCase):
    def setUp(self):
        self.llm_config = LLMConfig(
            provider="openai",
            model="dummy-model",
            base_url="https://example.com/v1",
            api_key="dummy-key",
            temperature=0.2,
        )
        self.common_config = CommonConfig(
            description="Agent / Safety / Trustworthy",
            num_workers=1,
            save=True,
            save_dir="./history",
        )
        self.generator = ReportGenerator(
            all_recs=sample_recommendations(),
            profile_text="Agent safety and evaluation researcher.",
            llm_config=self.llm_config,
            common_config=self.common_config,
            report_title="Daily Personal Briefing",
            min_score=4.0,
            max_items=6,
            theme_count=3,
            prediction_count=2,
            idea_count=2,
        )

    def test_generate_returns_fallback_report_when_llm_json_is_invalid(self):
        self.generator.model = QueueModel(
            [
                '{"report_title":"Bad JSON","opening":"This quote breaks " json"}',
                '{"still":"broken"',
            ]
        )

        report = self.generator.generate()

        self.assertIsNotNone(report)
        self.assertEqual(report["metadata"]["generation_mode"], "fallback")
        self.assertEqual(report["metadata"]["fallback_reason"], "llm_report_json_invalid")
        self.assertGreaterEqual(len(report["themes"]), 1)
        self.assertGreaterEqual(len(self.generator.model.prompts), 2)

    def test_render_email_and_save_work_for_fallback_report(self):
        fallback_report = self.generator._build_fallback_report(
            self.generator._filter_items(),
            reason="unit_test",
        )
        fallback_report["input_items"] = self.generator._filter_items()

        with tempfile.TemporaryDirectory() as tmpdir:
            self.generator.save_dir = tmpdir
            self.generator.email_cache_path = str(Path(tmpdir) / "report.html")

            self.generator.save(fallback_report)
            html = self.generator.render_email(fallback_report)

            self.assertTrue((Path(tmpdir) / "report.json").exists())
            self.assertTrue((Path(tmpdir) / "report.md").exists())
            self.assertTrue((Path(tmpdir) / "report.html").exists())
            self.assertIn("Daily Personal Briefing", html)


if __name__ == "__main__":
    unittest.main()
