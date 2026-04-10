import argparse
import json
import os
import re
from datetime import datetime

from base_source import BaseSource
from config import LLMConfig, CommonConfig
from email_utils.base_template import get_stars
from email_utils.twitter_template import get_tweet_block_html
from fetchers.profile_fetcher import build_profile_text_from_urls
from fetchers.twitter_fetcher import (
    DEFAULT_DISCOVERY_TIMEOUT,
    DEFAULT_RAPIDAPI_HOST,
    fetch_all_accounts,
    fetch_user_tweets_rapidapi,
    load_accounts,
    search_people_rapidapi,
    search_top_tweets_rapidapi,
)


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_list(name: str) -> list[str]:
    value = os.getenv(name)
    if not value:
        return []
    return [item.strip() for item in value.split() if item.strip()]


def _clean_json_text(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
        if "\n" in cleaned:
            first_line, rest = cleaned.split("\n", 1)
            if first_line.strip().lower() in {"json", "javascript"}:
                cleaned = rest.strip()

    start_positions = [idx for idx in (cleaned.find("{"), cleaned.find("[")) if idx != -1]
    end_positions = [idx for idx in (cleaned.rfind("}"), cleaned.rfind("]")) if idx != -1]
    if start_positions and end_positions:
        start = min(start_positions)
        end = max(end_positions) + 1
        cleaned = cleaned[start:end]
    return cleaned.strip()


def _query_variants(query: str) -> list[str]:
    base = str(query).strip()
    if not base:
        return []

    variants = []

    def _add(value: str):
        value = " ".join(value.split()).strip()
        if value and value not in variants:
            variants.append(value)

    _add(base)
    _add(base.replace("U.S.", "US").replace("U.K.", "UK"))
    _add(base.replace("&", "and"))
    _add(re.sub(r"[^\w\s-]", " ", base))
    return variants


class TwitterSource(BaseSource):
    name = "twitter"
    default_title = "Daily X/Twitter"

    def __init__(self, source_args: dict, llm_config: LLMConfig, common_config: CommonConfig):
        super().__init__(source_args, llm_config, common_config)
        self.api_key = source_args.get("rapidapi_key", "")
        self.api_host = source_args.get("rapidapi_host", DEFAULT_RAPIDAPI_HOST)
        self.since_hours = source_args.get("since_hours", 24)
        self.max_tweets_per_user = source_args.get("max_tweets_per_user", 20)
        self.max_tweets = source_args.get("max_tweets", 50)
        self.skip_retweets = source_args.get("skip_retweets", True)
        self.include_replies = source_args.get("include_replies", False)

        self.auto_discover_accounts = source_args.get("auto_discover_accounts", False)
        self.merge_static_accounts = source_args.get("merge_static_accounts", False)
        self.use_persisted_accounts = source_args.get("use_persisted_accounts", False)
        self.skip_discovery_if_persisted = source_args.get("skip_discovery_if_persisted", True)
        self.discovery_persist_file = source_args.get("discovery_persist_file") or "state/x_accounts.discovered.txt"
        self.profile_file = source_args.get("profile_file")
        self.profile_urls = source_args.get("profile_urls", [])
        self.discovery_rounds = max(1, int(source_args.get("discovery_rounds", 3)))
        self.discovery_expansion_rounds = max(1, int(source_args.get("discovery_expansion_rounds", 2)))
        self.discovery_max_core_accounts = max(
            1,
            int(
                source_args.get(
                    "discovery_max_core_accounts",
                    source_args.get("discovery_max_final_accounts", 12),
                )
            ),
        )
        # Keep the legacy field name as an alias for the core "must-watch" tier.
        self.discovery_max_final_accounts = self.discovery_max_core_accounts
        self.discovery_max_extended_accounts = max(
            self.discovery_max_core_accounts,
            int(
                source_args.get(
                    "discovery_max_extended_accounts",
                    max(self.discovery_max_core_accounts * 2, 20),
                )
            ),
        )
        self.discovery_max_candidates = max(
            int(source_args.get("discovery_max_candidates", 40)),
            self.discovery_max_extended_accounts + 12,
        )
        self.discovery_search_results_per_query = max(
            1,
            int(source_args.get("discovery_search_results_per_query", 6)),
        )
        self.discovery_sample_tweets = max(1, int(source_args.get("discovery_sample_tweets", 2)))
        self.discovery_sample_budget = max(self.discovery_max_extended_accounts + 8, 20)
        self.discovery_scoring_budget = max(self.discovery_max_core_accounts + 8, 18)
        self.discovery_search_timeout = max(5, int(source_args.get("discovery_search_timeout", DEFAULT_DISCOVERY_TIMEOUT)))
        self.discovery_min_score = float(source_args.get("discovery_min_score", 6.0))
        raw_discovery_profile, self.discovery_profile_sources = self._load_discovery_profile(
            self.profile_file,
            self.profile_urls,
        )
        self.discovery_profile = self._compact_discovery_profile(raw_discovery_profile)
        self.discovery_result = None

        if not self.api_key:
            raise ValueError("Twitter/X source requires --x_rapidapi_key (or --x_api_key).")

        accounts_file = source_args.get("accounts_file", "profiles/x_accounts.txt")
        static_accounts = load_accounts(accounts_file)
        persisted_accounts = load_accounts(self.discovery_persist_file) if os.path.exists(self.discovery_persist_file) else []

        if self.auto_discover_accounts:
            should_reuse_persisted = (
                self.use_persisted_accounts
                and self.skip_discovery_if_persisted
                and bool(persisted_accounts)
            )
            if should_reuse_persisted:
                print(f"[{self.name}] Reusing persisted discovery accounts from {self.discovery_persist_file}")
                discovered_accounts = persisted_accounts
                self.discovery_result = self._build_reused_discovery_result(discovered_accounts)
            else:
                discovered_accounts, discovery_result = self.discover_accounts(self.discovery_profile)
                self.discovery_result = discovery_result
                if discovered_accounts:
                    self._persist_discovered_accounts(discovered_accounts, discovery_result)

            if discovered_accounts:
                print(f"[{self.name}] Auto-discovered {len(discovered_accounts)} accounts from profile")
            elif persisted_accounts and self.use_persisted_accounts:
                print(f"[{self.name}] Discovery returned no accounts, falling back to {self.discovery_persist_file}")
                discovered_accounts = persisted_accounts
                if not self.discovery_result:
                    self.discovery_result = self._build_reused_discovery_result(discovered_accounts)
            elif static_accounts:
                print(f"[{self.name}] Discovery returned no accounts, falling back to {accounts_file}")

            secondary_accounts = static_accounts if (self.merge_static_accounts or not discovered_accounts) else []
            self.accounts = self._merge_accounts(discovered_accounts, secondary_accounts)
        else:
            if self.use_persisted_accounts and persisted_accounts:
                print(f"[{self.name}] Using persisted discovery accounts from {self.discovery_persist_file}")
                secondary_accounts = static_accounts if self.merge_static_accounts else []
                self.accounts = self._merge_accounts(persisted_accounts, secondary_accounts)
            else:
                self.accounts = static_accounts

        if self.common_config.save and self.discovery_result:
            self._save_discovery_outputs()

        if not self.accounts:
            print(f"[{self.name}] No accounts available for fetching")
            self.tweets = []
        else:
            print(f"[{self.name}] Using {len(self.accounts)} accounts")
            self.tweets = fetch_all_accounts(
                accounts=self.accounts,
                api_key=self.api_key,
                api_host=self.api_host,
                since_hours=self.since_hours,
                max_tweets_per_user=self.max_tweets_per_user,
            )
            print(f"[{self.name}] {len(self.tweets)} tweets prefetched")

    @staticmethod
    def add_arguments(parser: argparse.ArgumentParser):
        parser.add_argument(
            "--x_accounts_file", type=str, default=os.getenv("X_ACCOUNTS_FILE") or "profiles/x_accounts.txt",
            help="[Twitter] Path to accounts list file",
        )
        parser.add_argument(
            "--x_rapidapi_key", "--x_api_key", dest="x_rapidapi_key", type=str,
            default=os.getenv("X_RAPIDAPI_KEY") or "",
            help="[Twitter] RapidAPI key for twitter-api45 (or set X_RAPIDAPI_KEY in .env)",
        )
        parser.add_argument(
            "--x_rapidapi_host", "--x_api_host", dest="x_rapidapi_host", type=str,
            default=os.getenv("X_RAPIDAPI_HOST") or DEFAULT_RAPIDAPI_HOST,
            help="[Twitter] RapidAPI host",
        )
        parser.add_argument(
            "--x_discover_accounts", action="store_true", default=_env_bool("X_DISCOVER_ACCOUNTS", False),
            help="[Twitter] Discover accounts dynamically from a profile before fetching tweets",
        )
        parser.add_argument(
            "--x_no_discover_accounts", dest="x_discover_accounts", action="store_false",
            help="[Twitter] Disable account discovery and use the accounts file directly",
        )
        parser.add_argument(
            "--x_merge_static_accounts", action="store_true", default=_env_bool("X_MERGE_STATIC_ACCOUNTS", False),
            help="[Twitter] Merge discovered accounts with the static accounts file instead of replacing it",
        )
        parser.add_argument(
            "--x_use_persisted_accounts", action="store_true", default=_env_bool("X_USE_PERSISTED_ACCOUNTS", False),
            help="[Twitter] Reuse a persisted discovered account pool instead of rediscovering every run",
        )
        parser.add_argument(
            "--x_no_use_persisted_accounts", dest="x_use_persisted_accounts", action="store_false",
            help="[Twitter] Ignore the persisted discovered account pool",
        )
        parser.add_argument(
            "--x_skip_discovery_if_persisted",
            action="store_true",
            default=_env_bool("X_SKIP_DISCOVERY_IF_PERSISTED", True),
            help="[Twitter] When discovery output already exists, skip fresh discovery and reuse it",
        )
        parser.add_argument(
            "--x_force_refresh_discovery", dest="x_skip_discovery_if_persisted", action="store_false",
            help="[Twitter] Force a fresh discovery even if a persisted discovered account pool exists",
        )
        parser.add_argument(
            "--x_discovery_persist_file",
            type=str,
            default=os.getenv("X_DISCOVERY_PERSIST_FILE") or "state/x_accounts.discovered.txt",
            help="[Twitter] File used to persist the discovered account pool for future monitoring",
        )
        parser.add_argument(
            "--x_profile_file", type=str, default=os.getenv("X_PROFILE_FILE") or None,
            help="[Twitter] Optional profile file used for account discovery; defaults to the main description file",
        )
        parser.add_argument(
            "--x_profile_urls", nargs="+", default=_env_list("X_PROFILE_URLS"),
            help="[Twitter] Optional profile URLs (homepage / Google Scholar) used for account discovery",
        )
        parser.add_argument(
            "--x_discovery_rounds", type=int, default=int(os.getenv("X_DISCOVERY_ROUNDS", "3")),
            help="[Twitter] Number of iterative discovery rounds",
        )
        parser.add_argument(
            "--x_discovery_expansion_rounds",
            type=int,
            default=int(os.getenv("X_DISCOVERY_EXPANSION_ROUNDS", "2")),
            help="[Twitter] Number of post-search coverage-expansion passes",
        )
        parser.add_argument(
            "--x_discovery_max_candidates", type=int, default=int(os.getenv("X_DISCOVERY_MAX_CANDIDATES", "40")),
            help="[Twitter] Max candidate accounts kept during discovery",
        )
        parser.add_argument(
            "--x_discovery_max_final_accounts", type=int, default=int(os.getenv("X_DISCOVERY_MAX_FINAL_ACCOUNTS", "12")),
            help="[Twitter] Legacy alias for the core must-watch account count",
        )
        parser.add_argument(
            "--x_discovery_max_core_accounts",
            type=int,
            default=int(os.getenv("X_DISCOVERY_MAX_CORE_ACCOUNTS", os.getenv("X_DISCOVERY_MAX_FINAL_ACCOUNTS", "12"))),
            help="[Twitter] Max core must-watch accounts selected by discovery",
        )
        parser.add_argument(
            "--x_discovery_max_extended_accounts",
            type=int,
            default=int(os.getenv("X_DISCOVERY_MAX_EXTENDED_ACCOUNTS", "24")),
            help="[Twitter] Max extended broader watchlist accounts selected by discovery",
        )
        parser.add_argument(
            "--x_discovery_search_results_per_query",
            type=int,
            default=int(os.getenv("X_DISCOVERY_SEARCH_RESULTS_PER_QUERY", "6")),
            help="[Twitter] Max RapidAPI results consumed per discovery query",
        )
        parser.add_argument(
            "--x_discovery_sample_tweets", type=int, default=int(os.getenv("X_DISCOVERY_SAMPLE_TWEETS", "2")),
            help="[Twitter] Number of recent tweets sampled per discovered candidate",
        )
        parser.add_argument(
            "--x_discovery_search_timeout",
            type=int,
            default=int(os.getenv("X_DISCOVERY_SEARCH_TIMEOUT", str(DEFAULT_DISCOVERY_TIMEOUT))),
            help="[Twitter] Timeout in seconds for discovery-time RapidAPI search/timeline probes",
        )
        parser.add_argument(
            "--x_discovery_min_score", type=float, default=float(os.getenv("X_DISCOVERY_MIN_SCORE", "6.0")),
            help="[Twitter] Minimum LLM fit score for a discovered account to be auto-included",
        )
        parser.add_argument(
            "--x_since_hours", type=int, default=24,
            help="[Twitter] Fetch tweets from the last N hours",
        )
        parser.add_argument(
            "--x_max_tweets_per_user", type=int, default=20,
            help="[Twitter] Max tweets to fetch per user",
        )
        parser.add_argument(
            "--x_max_tweets", type=int, default=50,
            help="[Twitter] Max total tweets to recommend",
        )
        parser.add_argument(
            "--x_skip_retweets", action="store_true", default=True,
            help="[Twitter] Skip retweets (default: True)",
        )
        parser.add_argument(
            "--x_no_skip_retweets", dest="x_skip_retweets", action="store_false",
            help="[Twitter] Include retweets",
        )
        parser.add_argument(
            "--x_include_replies", action="store_true", default=False,
            help="[Twitter] Include replies (default: False)",
        )

    @staticmethod
    def extract_args(args) -> dict:
        return {
            "accounts_file": args.x_accounts_file,
            "rapidapi_key": args.x_rapidapi_key,
            "rapidapi_host": args.x_rapidapi_host,
            "auto_discover_accounts": args.x_discover_accounts,
            "merge_static_accounts": args.x_merge_static_accounts,
            "use_persisted_accounts": args.x_use_persisted_accounts,
            "skip_discovery_if_persisted": args.x_skip_discovery_if_persisted,
            "discovery_persist_file": args.x_discovery_persist_file,
            "profile_file": args.x_profile_file,
            "profile_urls": args.x_profile_urls,
            "discovery_rounds": args.x_discovery_rounds,
            "discovery_expansion_rounds": args.x_discovery_expansion_rounds,
            "discovery_max_candidates": args.x_discovery_max_candidates,
            "discovery_max_final_accounts": args.x_discovery_max_final_accounts,
            "discovery_max_core_accounts": args.x_discovery_max_core_accounts,
            "discovery_max_extended_accounts": args.x_discovery_max_extended_accounts,
            "discovery_search_results_per_query": args.x_discovery_search_results_per_query,
            "discovery_sample_tweets": args.x_discovery_sample_tweets,
            "discovery_search_timeout": args.x_discovery_search_timeout,
            "discovery_min_score": args.x_discovery_min_score,
            "since_hours": args.x_since_hours,
            "max_tweets_per_user": args.x_max_tweets_per_user,
            "max_tweets": args.x_max_tweets,
            "skip_retweets": args.x_skip_retweets,
            "include_replies": args.x_include_replies,
        }

    def _load_json_response(self, response: str) -> dict:
        return json.loads(_clean_json_text(response))

    def _load_discovery_profile(self, profile_file: str | None, profile_urls: list[str]) -> tuple[str, list[dict]]:
        parts = []
        sources = []

        if self.description.strip():
            parts.append(f"[Base description]\n{self.description.strip()}")
            sources.append({"kind": "base_description", "status": "ok"})

        if profile_file:
            with open(profile_file, "r", encoding="utf-8") as f:
                file_text = f.read().strip()
            if file_text:
                parts.append(f"[Profile file: {profile_file}]\n{file_text}")
                sources.append({"kind": "profile_file", "status": "ok", "path": profile_file})

        if profile_urls:
            url_text, url_sources = build_profile_text_from_urls(profile_urls)
            if url_text:
                parts.append(url_text)
            sources.extend(url_sources)

        merged = "\n\n".join(part for part in parts if part).strip()
        return merged, sources

    def _compact_discovery_profile(self, profile_text: str, max_chars: int = 5000) -> str:
        text = str(profile_text or "").strip()
        if len(text) <= max_chars:
            return text

        kept_lines = []
        publication_lines = []
        narrative_lines = []
        seen = set()

        def _add(target: list[str], line: str) -> None:
            normalized = " ".join(line.split())
            if normalized and normalized not in seen:
                seen.add(normalized)
                target.append(normalized)

        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            lower = line.lower()

            if (
                line.startswith("[")
                or lower.startswith(("scholar name:", "affiliation:", "interests:", "title:"))
                or "research interest" in lower
                or lower.startswith(("currently, i am", "i am ", "we are looking"))
                or "working at" in lower
                or "open to collaboration" in lower
            ):
                _add(kept_lines, line)
                continue

            if lower.startswith("publication:") or "[ pdf ]" in lower or "accepted by" in lower:
                _add(publication_lines, line)
                continue

            if len(line) >= 40:
                _add(narrative_lines, line)

        compact_lines = kept_lines + publication_lines[:12] + narrative_lines[:10]
        compact_text = "\n".join(compact_lines).strip()
        if len(compact_text) > max_chars:
            compact_text = compact_text[:max_chars].rsplit("\n", 1)[0].strip()
        if compact_text and len(compact_text) < len(text):
            print(f"[{self.name}] Compacted discovery profile from {len(text)} to {len(compact_text)} chars")
        return compact_text or text[:max_chars]

    def _merge_accounts(self, primary: list[str], secondary: list[str]) -> list[str]:
        merged = []
        seen = set()
        for username in primary + secondary:
            handle = username.lstrip("@").strip()
            if handle and handle not in seen:
                seen.add(handle)
                merged.append(handle)
        return merged

    def _persist_tier_path(self, tier: str) -> str:
        if self.discovery_persist_file.endswith(".txt"):
            return f"{self.discovery_persist_file[:-4]}.{tier}.txt"
        return f"{self.discovery_persist_file}.{tier}"

    def _write_account_list(self, path: str, accounts: list[str]) -> None:
        normalized = self._merge_accounts(accounts, [])
        with open(path, "w", encoding="utf-8") as f:
            for account in normalized:
                f.write(f"{account}\n")

    def _persist_discovered_accounts(self, accounts: list[str], discovery_result: dict | None) -> None:
        if not accounts or not self.discovery_persist_file:
            return

        persist_dir = os.path.dirname(self.discovery_persist_file)
        if persist_dir:
            os.makedirs(persist_dir, exist_ok=True)

        json_path = f"{self.discovery_persist_file}.json"
        payload = discovery_result or {"selected_accounts": accounts}
        core_accounts = payload.get("core_selected_accounts") or accounts[: self.discovery_max_core_accounts]
        extended_accounts = payload.get("extended_selected_accounts") or accounts
        core_path = self._persist_tier_path("core")
        extended_path = self._persist_tier_path("extended")

        self._write_account_list(self.discovery_persist_file, accounts)
        self._write_account_list(core_path, core_accounts)
        self._write_account_list(extended_path, extended_accounts)
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

        print(
            f"[{self.name}] Persisted discovered accounts to "
            f"{self.discovery_persist_file}, {core_path}, {extended_path}, and {json_path}"
        )

    def _build_reused_discovery_result(self, accounts: list[str]) -> dict:
        json_path = f"{self.discovery_persist_file}.json"
        if os.path.exists(json_path):
            try:
                with open(json_path, "r", encoding="utf-8") as f:
                    payload = json.load(f)
                if isinstance(payload, dict):
                    return payload
            except (OSError, json.JSONDecodeError) as e:
                print(f"[{self.name}] Failed to load persisted discovery metadata: {e}")

        return {
            "mode": "reused_persisted_accounts",
            "profile_text": self.discovery_profile,
            "circle_profile": {},
            "profile_sources": self.discovery_profile_sources,
            "core_selected_accounts": accounts[: self.discovery_max_core_accounts],
            "extended_selected_accounts": accounts,
            "selected_accounts": accounts,
            "candidates": [],
            "rounds": [],
            "persist_file": self.discovery_persist_file,
        }

    def _call_json_model(self, prompt: str, temperature: float = 0.2) -> dict:
        raw = self.model.inference(prompt, temperature=temperature)
        return self._load_json_response(raw)

    def _fallback_topic_queries(self, profile_text: str) -> list[str]:
        queries = []
        for raw_line in profile_text.splitlines():
            line = raw_line.strip().lstrip("-").strip()
            line = line.lstrip("0123456789. ").strip()
            if len(line) >= 3 and line not in queries:
                queries.append(line)
        if not queries:
            queries.append("AI agents")
        return queries[:6]

    def _build_circle_profile(self, profile_text: str) -> dict:
        if not profile_text.strip():
            return {
                "primary_circles": [],
                "keywords": [],
                "leader_archetypes": [],
                "critical_actor_types": [],
                "summary": "",
            }

        prompt = f"""
You are converting a user profile into a domain monitoring thesis for X/Twitter account discovery.

User profile:
{profile_text}

Requirements:
1. Extract the user's domain, subdomains, and recurring problems to monitor.
2. Do not anchor on the user's collaborators, advisors, coauthors, or nearby people unless they are globally important public figures in that domain.
3. Keep the domains abstract enough to drive search. Good examples: "AI agents", "central banking and macro policy", "biotech regulation", "developer infrastructure", "energy geopolitics".
4. `leader_archetypes` should describe what kinds of top voices matter in this domain.
5. `critical_actor_types` should explicitly name the classes of accounts the system should care about. Depending on the domain these might include founders, researchers, regulators, policymakers, official institutions, journalists, investors, company accounts, labs, trade groups, or developer accounts.

Return JSON:
{{
  "primary_circles": ["..."],
  "keywords": ["..."],
  "leader_archetypes": ["..."],
  "critical_actor_types": ["..."],
  "summary": "One concise English summary of what domain this user is in and what kinds of voices should be monitored"
}}
Use at most 5 primary_circles, 8 keywords, 5 leader_archetypes, and 8 critical_actor_types.
"""
        try:
            data = self._call_json_model(prompt, temperature=0.1)
        except Exception as e:
            print(f"[{self.name}] Circle profile extraction failed: {e}")
            return {
                "primary_circles": [],
                "keywords": self._fallback_topic_queries(profile_text),
                "leader_archetypes": [],
                "critical_actor_types": [],
                "summary": "",
            }

        def _string_list(items, limit):
            values = []
            for item in items[:limit]:
                text = str(item).strip()
                if text and text not in values:
                    values.append(text)
            return values

        return {
            "primary_circles": _string_list(data.get("primary_circles", []), 5),
            "keywords": _string_list(data.get("keywords", []), 8),
            "leader_archetypes": _string_list(data.get("leader_archetypes", []), 5),
            "critical_actor_types": _string_list(data.get("critical_actor_types", []), 8),
            "summary": str(data.get("summary", "")).strip(),
        }

    def _format_circle_profile(self, circle_profile: dict) -> str:
        lines = []
        circles = circle_profile.get("primary_circles", [])
        keywords = circle_profile.get("keywords", [])
        archetypes = circle_profile.get("leader_archetypes", [])
        actor_types = circle_profile.get("critical_actor_types", [])
        summary = str(circle_profile.get("summary", "")).strip()

        if circles:
            lines.append("Primary circles: " + ", ".join(circles))
        if keywords:
            lines.append("Keywords: " + ", ".join(keywords))
        if archetypes:
            lines.append("Leader archetypes: " + ", ".join(archetypes))
        if actor_types:
            lines.append("Critical actor types: " + ", ".join(actor_types))
        if summary:
            lines.append("Summary: " + summary)
        return "\n".join(lines).strip()

    def _summarize_candidates_for_planning(self, candidate_pool: dict[str, dict]) -> str:
        if not candidate_pool:
            return "No candidates yet."

        lines = []
        ranked = sorted(
            candidate_pool.values(),
            key=lambda item: (item.get("discovery_score", 0), item.get("followers_count", 0)),
            reverse=True,
        )
        for candidate in ranked[:10]:
            lines.append(
                f"@{candidate['screen_name']} / {candidate.get('name', '')} / "
                f"decision={candidate.get('discovery_decision', 'unknown')} / "
                f"score={candidate.get('discovery_score', 0)} / "
                f"category={candidate.get('discovery_category', 'unknown')} / "
                f"followers={candidate.get('followers_count', 0)} / "
                f"verified={candidate.get('verified', False)} / "
                f"queries={', '.join(candidate.get('queries', [])[:3])}"
            )
        return "\n".join(lines)

    def _plan_discovery_queries(
        self,
        profile_text: str,
        round_index: int,
        searched_queries: dict[str, set[str]],
        candidate_pool: dict[str, dict],
    ) -> dict:
        prompt = f"""
You are planning the next search step for a domain-specific X/Twitter monitoring list.

Domain monitoring thesis:
{profile_text}

Current round: {round_index + 1}
Already searched people queries:
{sorted(searched_queries['people'])}

Already searched organization queries:
{sorted(searched_queries['organization'])}

Already searched topic queries:
{sorted(searched_queries['topic'])}

Current candidate summary:
{self._summarize_candidates_for_planning(candidate_pool)}

Plan the next search round. Rules:
1. The goal is not to find the user's nearby people. The goal is to find the highest-signal public voices for this domain.
2. The right actor types depend on the domain. For example:
   - research/technology: founders, lab heads, major company accounts, leading researchers, developer ecosystem accounts
   - finance/macro: central banks, treasury/finance ministries, regulators, policymakers, market structure voices, major financial institutions
   - policy/geopolitics: government officials, agencies, party/committee accounts, think tanks, domain journalists
3. Prefer first-hand, public, domain-shaping accounts over nearby peers or weakly related commentators.
4. `people_queries` should contain high-signal individuals. `organization_queries` should contain institutions, agencies, labs, companies, publications, or official programs, and should prefer X-search-friendly names or handles when possible. `topic_queries` should contain short live-topic phrases suitable for tweet search.
5. Avoid duplicate queries.
6. If the domain is narrow, stay precise. If the domain is broad, deliberately cover multiple actor types instead of over-concentrating on one subgroup.
7. Over-search rather than under-search. It is better to start with a wide candidate pool and narrow later.

Return JSON:
{{
  "circles": ["..."],
  "people_queries": ["..."],
  "organization_queries": ["..."],
  "topic_queries": ["..."],
  "notes": "One short English sentence explaining the search intent for this round"
}}
Use at most 5 circles, 7 people_queries, 6 organization_queries, and 6 topic_queries.
"""
        try:
            data = self._call_json_model(prompt, temperature=0.2)
        except Exception as e:
            print(f"[{self.name}] Discovery planning failed in round {round_index + 1}: {e}")
            data = {
                "circles": [],
                "people_queries": [],
                "organization_queries": [],
                "topic_queries": self._fallback_topic_queries(profile_text),
                "notes": "fallback",
            }

        circles = []
        for item in data.get("circles", [])[:5]:
            circle = str(item).strip()
            if circle:
                circles.append(circle)

        people_queries = []
        for item in data.get("people_queries", [])[:7]:
            query = str(item).strip()
            if query:
                people_queries.append(query)

        organization_queries = []
        for item in data.get("organization_queries", [])[:6]:
            query = str(item).strip()
            if query:
                organization_queries.append(query)

        topic_queries = []
        for item in data.get("topic_queries", [])[:6]:
            query = str(item).strip()
            if query:
                topic_queries.append(query)

        if round_index == 0 and not people_queries and not organization_queries and not topic_queries:
            topic_queries = self._fallback_topic_queries(profile_text)

        return {
            "circles": circles[:5],
            "people_queries": people_queries[:7],
            "organization_queries": organization_queries[:6],
            "topic_queries": topic_queries,
            "notes": str(data.get("notes", "")).strip(),
        }

    def _simplify_tweet_for_discovery(self, tweet: dict) -> dict:
        return {
            "tweet_id": tweet.get("tweet_id", ""),
            "text": tweet.get("text", ""),
            "url": tweet.get("tweet_url", "") or tweet.get("url", ""),
            "likes": tweet.get("likes", 0),
            "retweets": tweet.get("retweets", 0),
            "replies": tweet.get("replies", 0),
            "created_at": tweet.get("created_at", ""),
            "is_retweet": tweet.get("is_retweet", False),
        }

    def _upsert_candidate(
        self,
        candidate_pool: dict[str, dict],
        screen_name: str,
        name: str = "",
        followers_count: int = 0,
        source: str = "",
        query: str = "",
        sample_tweet: dict | None = None,
        verified: bool = False,
    ) -> None:
        handle = screen_name.lstrip("@").strip()
        if not handle:
            return

        candidate = candidate_pool.setdefault(
            handle,
            {
                "screen_name": handle,
                "name": name or handle,
                "followers_count": int(followers_count or 0),
                "verified": bool(verified),
                "sources": [],
                "queries": [],
                "sample_tweets": [],
                "discovery_decision": "unknown",
                "discovery_score": 0.0,
                "discovery_category": "unknown",
                "discovery_reason": "",
                "_dirty": True,
                "_sampled": False,
                "_authority_checked": False,
            },
        )

        if name and (candidate.get("name") in {"", handle}):
            candidate["name"] = name
        candidate["followers_count"] = max(candidate.get("followers_count", 0), int(followers_count or 0))
        candidate["verified"] = candidate.get("verified", False) or bool(verified)

        if source and source not in candidate["sources"]:
            candidate["sources"].append(source)
        if query and query not in candidate["queries"]:
            candidate["queries"].append(query)

        if sample_tweet:
            simplified = self._simplify_tweet_for_discovery(sample_tweet)
            known_ids = {item.get("tweet_id") for item in candidate["sample_tweets"]}
            if simplified["tweet_id"] and simplified["tweet_id"] not in known_ids:
                candidate["sample_tweets"].append(simplified)
                candidate["_dirty"] = True

    def _prune_candidate_pool(self, candidate_pool: dict[str, dict]) -> dict[str, dict]:
        if len(candidate_pool) <= self.discovery_max_candidates:
            return candidate_pool

        ranked = sorted(
            candidate_pool.values(),
            key=lambda item: (
                item.get("discovery_decision") == "include",
                item.get("discovery_score", 0),
                len(item.get("sources", [])),
                len(item.get("queries", [])),
                item.get("verified", False),
                item.get("followers_count", 0),
            ),
            reverse=True,
        )[:self.discovery_max_candidates]
        return {candidate["screen_name"]: candidate for candidate in ranked}

    def _ensure_candidate_samples(self, candidate: dict) -> None:
        if candidate.get("_sampled"):
            return

        tweets = fetch_user_tweets_rapidapi(
            username=candidate["screen_name"],
            api_key=self.api_key,
            api_host=self.api_host,
            since_hours=max(self.since_hours, 24 * 30),
            max_tweets=self.discovery_sample_tweets,
            timeout=self.discovery_search_timeout,
        )
        known_ids = {item.get("tweet_id") for item in candidate.get("sample_tweets", [])}
        for tweet in tweets:
            simplified = self._simplify_tweet_for_discovery(tweet)
            if simplified["tweet_id"] and simplified["tweet_id"] not in known_ids:
                candidate["sample_tweets"].append(simplified)
        candidate["_sampled"] = True
        candidate["_dirty"] = True

    def _candidate_sampling_priority(self, candidate: dict) -> tuple:
        source_set = set(candidate.get("sources", []))
        return (
            "organization_search" in source_set,
            "people_search" in source_set,
            candidate.get("verified", False),
            int(candidate.get("followers_count", 0) or 0),
            bool(candidate.get("sample_tweets")),
            len(candidate.get("queries", [])),
            len(source_set),
        )

    def _heuristic_seed_candidate(self, candidate: dict) -> None:
        source_set = set(candidate.get("sources", []))
        followers = int(candidate.get("followers_count", 0) or 0)
        verified = bool(candidate.get("verified", False))
        name_lower = str(candidate.get("name", "")).lower()

        category = "other"
        if "organization_search" in source_set:
            if any(token in name_lower for token in ("ai", "lab", "labs", "research", "institute", "center", "hai")):
                category = "lab"
            elif any(token in name_lower for token in ("news", "times", "post", "journal", "media")):
                category = "media"
            else:
                category = "institution"
        elif "people_search" in source_set:
            category = "researcher"

        score = 4.0
        decision = "exclude"
        if verified or followers >= 500000:
            score = 6.2
            decision = "watch"
        elif followers >= 100000:
            score = 5.8
            decision = "watch"
        elif followers >= 15000 and ("organization_search" in source_set or "people_search" in source_set):
            score = 5.4
            decision = "watch"
        elif candidate.get("sample_tweets"):
            score = 5.0
            decision = "watch"

        candidate["discovery_decision"] = decision
        candidate["discovery_score"] = score
        candidate["discovery_category"] = category
        candidate["discovery_reason"] = "Heuristic pre-screen before detailed scoring."
        candidate["_dirty"] = False

    def _normalize_discovery_decision(self, value: str) -> str:
        normalized = value.strip().lower()
        if normalized in {"include", "included", "yes", "keep", "保留", "纳入"}:
            return "include"
        if normalized in {"watch", "maybe", "uncertain", "观察", "待观察"}:
            return "watch"
        return "exclude"

    def _hydrate_candidate_authority(self, candidate: dict) -> None:
        if candidate.get("_authority_checked"):
            return
        candidate["_authority_checked"] = True

        if candidate.get("followers_count", 0) or candidate.get("verified", False):
            return

        source_set = set(candidate.get("sources", []))
        handle = str(candidate.get("screen_name", "")).strip()
        digit_count = sum(ch.isdigit() for ch in handle)
        if source_set == {"topic_search"} and (digit_count >= 4 or len(handle) >= 16):
            return

        queries = [candidate.get("screen_name", ""), candidate.get("name", "")]
        handle_lower = candidate.get("screen_name", "").strip().lower()

        for query in queries:
            query = str(query).strip()
            if not query:
                continue
            results = search_people_rapidapi(
                query=query,
                api_key=self.api_key,
                api_host=self.api_host,
                max_results=5,
                timeout=self.discovery_search_timeout,
            )
            for item in results:
                screen_name = str(item.get("screen_name", "")).strip().lower()
                if screen_name != handle_lower:
                    continue
                candidate["followers_count"] = max(
                    candidate.get("followers_count", 0),
                    int(item.get("followers_count", 0) or 0),
                )
                candidate["verified"] = candidate.get("verified", False) or bool(item.get("verified", False))
                if item.get("name") and candidate.get("name") in {"", candidate.get("screen_name", "")}:
                    candidate["name"] = item["name"]
                if "people_lookup" not in candidate["sources"]:
                    candidate["sources"].append("people_lookup")
                return

    def _search_people_query_variants(self, query: str, searched_bucket: set[str]) -> list[dict]:
        best_results = []
        best_score = -1.0
        base_query = str(query).strip().lower()

        for variant in _query_variants(query):
            normalized = variant.strip().lower()
            if not normalized or normalized in searched_bucket:
                continue
            searched_bucket.add(normalized)

            results = search_people_rapidapi(
                query=variant,
                api_key=self.api_key,
                api_host=self.api_host,
                max_results=self.discovery_search_results_per_query,
                timeout=self.discovery_search_timeout,
            )
            if not results:
                continue

            variant_score = 0.0
            for rank, item in enumerate(results[:3], 1):
                followers = float(item.get("followers_count", 0) or 0)
                name = str(item.get("name", "")).lower()
                handle = str(item.get("screen_name", "")).lower()
                variant_score = max(variant_score, followers)
                if item.get("verified"):
                    variant_score += 100000.0
                if base_query and (base_query in name or base_query in handle):
                    variant_score += 50000.0 / rank
                token_hits = sum(
                    1 for token in base_query.split()
                    if len(token) >= 2 and (token in name or token in handle)
                )
                variant_score += 5000.0 * token_hits / rank

            if variant_score > best_score:
                best_score = variant_score
                best_results = results

        return best_results

    def _candidate_public_voice_bar(self, candidate: dict) -> bool:
        followers_count = int(candidate.get("followers_count", 0) or 0)
        verified = bool(candidate.get("verified", False))
        category = candidate.get("discovery_category", "other")

        if verified:
            return True

        min_followers = 3000
        if category in {
            "company",
            "lab",
            "community",
            "media",
            "policymaker",
            "regulator",
            "government",
            "institution",
            "journalist",
        }:
            min_followers = 1500
        return followers_count >= min_followers

    def _candidate_identity_key(self, candidate: dict) -> str:
        name = " ".join(str(candidate.get("name", "")).strip().lower().split())
        if len(name) >= 6:
            return f"name:{name}"
        return f"handle:{str(candidate.get('screen_name', '')).strip().lower()}"

    def _candidate_monitor_priority_ok(self, candidate: dict) -> bool:
        decision = candidate.get("discovery_decision", "exclude")
        score = float(candidate.get("discovery_score", 0) or 0)
        followers = int(candidate.get("followers_count", 0) or 0)
        sources = set(candidate.get("sources", []))

        if decision == "include" and self._candidate_public_voice_bar(candidate):
            return True

        if decision != "watch":
            return False

        if score >= max(self.discovery_min_score - 1.0, 5.5) and self._candidate_public_voice_bar(candidate):
            return True

        # Allow a few high-impact global voices even if the model marked them as
        # borderline watch, but avoid topic-only commentators.
        if (
            score >= 5.0
            and followers >= 500000
            and ("people_search" in sources or "organization_search" in sources)
            and "topic_search" not in sources
        ):
            return True

        return False

    def _candidate_core_priority_ok(self, candidate: dict) -> bool:
        if (
            candidate.get("discovery_decision") == "include"
            and candidate.get("discovery_score", 0) >= self.discovery_min_score
            and self._candidate_public_voice_bar(candidate)
        ):
            return True

        if candidate.get("discovery_decision") != "watch":
            return False

        score = float(candidate.get("discovery_score", 0) or 0)
        followers = int(candidate.get("followers_count", 0) or 0)
        category = candidate.get("discovery_category", "other")
        sources = set(candidate.get("sources", []))

        if (
            score >= max(self.discovery_min_score, 6.5)
            and followers >= 250000
            and ("people_search" in sources or "organization_search" in sources)
        ):
            return True

        if (
            score >= max(self.discovery_min_score, 6.5)
            and category in {"company", "lab", "institution", "government", "regulator", "policymaker"}
            and followers >= 50000
            and ("organization_search" in sources or candidate.get("verified", False))
        ):
            return True

        return False

    def _candidate_summary_for_selection(self, candidates: list[dict], limit: int = 25) -> str:
        lines = []
        for candidate in candidates[:limit]:
            sample_tweets = candidate.get("sample_tweets", [])[:1]
            sample_text = sample_tweets[0].get("text", "") if sample_tweets else ""
            sample_text = " ".join(sample_text.split())[:160]
            lines.append(
                f"@{candidate['screen_name']} | name={candidate.get('name', '')} | "
                f"decision={candidate.get('discovery_decision', 'unknown')} | "
                f"score={candidate.get('discovery_score', 0)} | "
                f"category={candidate.get('discovery_category', 'unknown')} | "
                f"followers={candidate.get('followers_count', 0)} | "
                f"verified={candidate.get('verified', False)} | "
                f"sources={','.join(candidate.get('sources', []))} | "
                f"queries={','.join(candidate.get('queries', [])[:4])} | "
                f"sample={sample_text}"
            )
        return "\n".join(lines)

    def _plan_coverage_gap_queries(
        self,
        profile_text: str,
        candidate_pool: dict[str, dict],
        selected_accounts: list[str],
    ) -> dict:
        prompt = f"""
You are auditing whether a domain monitoring list is broad enough for the user to understand what is happening in that domain.

Domain monitoring thesis:
{profile_text}

Currently selected accounts:
{selected_accounts}

Current candidate pool summary:
{self._summarize_candidates_for_planning(candidate_pool)}

Check whether important coverage is still missing.

Rules:
- The goal is: "if the user watches these accounts, they can roughly understand the latest dynamics in this domain."
- The missing buckets must be domain-specific. For example, in finance this may mean central banks, regulators, treasury/policy figures, major institutions, macro commentators, and market structure voices. In AI it may mean frontier labs, researchers, developers, eval/safety voices, and official product/research accounts.
- If the current list is too concentrated on one institution, one ideology, one role type, or one narrow subtopic, fix that.
- Only propose high-leverage, publicly relevant, continuously active accounts or institutions.
- Do not fill gaps with nearby peers, same-name small accounts, or low-signal aggregators.
- If the candidate pool still feels small or narrow, keep proposing expansion queries rather than declaring coverage complete.

Return JSON:
{{
  "coverage_ok": true,
  "missing_buckets": ["..."],
  "people_queries": ["..."],
  "organization_queries": ["..."],
  "topic_queries": ["..."],
  "notes": "One short English explanation"
}}
Use at most 7 people_queries, 6 organization_queries, and 6 topic_queries.
"""
        try:
            data = self._call_json_model(prompt, temperature=0.1)
        except Exception as e:
            print(f"[{self.name}] Coverage-gap planning failed: {e}")
            return {
                "coverage_ok": False,
                "missing_buckets": [],
                "people_queries": [],
                "organization_queries": [],
                "topic_queries": [],
                "notes": "coverage planning failed",
            }

        def _string_list(items, limit):
            values = []
            for item in items[:limit]:
                text = str(item).strip()
                if text and text not in values:
                    values.append(text)
            return values

        return {
            "coverage_ok": bool(data.get("coverage_ok", False)),
            "missing_buckets": _string_list(data.get("missing_buckets", []), 6),
            "people_queries": _string_list(data.get("people_queries", []), 7),
            "organization_queries": _string_list(data.get("organization_queries", []), 6),
            "topic_queries": _string_list(data.get("topic_queries", []), 6),
            "notes": str(data.get("notes", "")).strip(),
        }

    def _normalize_selected_handles(
        self,
        requested_handles: list[str],
        candidate_by_handle: dict[str, dict],
        limit: int,
        validator,
    ) -> list[str]:
        selected = []
        for item in requested_handles[:limit]:
            handle = str(item).lstrip("@").strip()
            candidate = candidate_by_handle.get(handle)
            if handle and candidate and handle not in selected and validator(candidate):
                selected.append(handle)
        return selected

    def _top_up_selected_accounts(
        self,
        requested_handles: list[str],
        final_candidates: list[dict],
        limit: int,
        primary_validator,
        secondary_validator=None,
    ) -> list[str]:
        candidate_by_handle = {candidate["screen_name"]: candidate for candidate in final_candidates}
        selected = []
        selected_identity_keys = set()

        def _try_add(candidate: dict | None, validator) -> None:
            if not candidate or len(selected) >= limit or not validator(candidate):
                return
            handle = candidate["screen_name"]
            identity_key = self._candidate_identity_key(candidate)
            if handle in selected or identity_key in selected_identity_keys:
                return
            selected.append(handle)
            selected_identity_keys.add(identity_key)

        for handle in requested_handles:
            _try_add(candidate_by_handle.get(str(handle).lstrip("@").strip()), primary_validator)

        if len(selected) < limit:
            for candidate in final_candidates:
                _try_add(candidate, primary_validator)
                if len(selected) >= limit:
                    break

        if secondary_validator and len(selected) < limit:
            for candidate in final_candidates:
                _try_add(candidate, secondary_validator)
                if len(selected) >= limit:
                    break

        return selected

    def _select_account_tiers(self, profile_text: str, final_candidates: list[dict]) -> tuple[list[str], list[str], str]:
        if not final_candidates:
            return [], [], ""

        prompt = f"""
You are selecting two tiers of a domain monitoring list from a candidate pool.

Goal:
- If the user watches the core list, they should catch the essential domain signal.
- If the user watches the extended list, they should have much broader coverage and understand more of the domain's live dynamics.
- Do not only choose the most on-topic narrow specialists. Keep broad, useful coverage.

Domain monitoring thesis:
{profile_text}

Candidate pool:
{self._candidate_summary_for_selection(final_candidates, limit=45)}

Selection rules:
1. `core_selected_accounts` should be the must-watch list: essential high-signal accounts only.
2. `extended_selected_accounts` should be a broader still-high-signal watchlist. It should include the core accounts plus additional worthwhile voices if the pool allows.
3. Prefer high-impact, continuously active accounts that each cover an important slice of the domain.
4. The role mix should be domain-appropriate. Depending on the domain this may include official institutions, regulators, policymakers, major companies, research leaders, journalists, investors, developer ecosystem accounts, or technical operators.
5. Avoid same-name duplicates, low-signal accounts, and low-authority commentators.
6. Do not select discovery_decision=exclude accounts.
7. Prefer first-hand signal sources. Only use commentary/aggregator accounts if they add clear incremental value and there is no better first-hand substitute in the pool.
8. If the pool allows it, make the extended list materially larger than the core list instead of collapsing them into the same few accounts.
9. Keep the core list within {self.discovery_max_core_accounts} accounts and the extended list within {self.discovery_max_extended_accounts} accounts.

Return JSON:
{{
  "core_selected_accounts": ["handle1", "handle2"],
  "extended_selected_accounts": ["handle1", "handle2", "handle3"],
  "notes": "One short English explanation for why these two tiers provide strong domain coverage"
}}
"""
        try:
            data = self._call_json_model(prompt, temperature=0.1)
        except Exception as e:
            print(f"[{self.name}] Tiered selection failed: {e}")
            return [], [], ""

        candidate_by_handle = {candidate["screen_name"]: candidate for candidate in final_candidates}
        core_requested = self._normalize_selected_handles(
            data.get("core_selected_accounts", []),
            candidate_by_handle,
            self.discovery_max_core_accounts,
            self._candidate_core_priority_ok,
        )
        extended_requested = self._normalize_selected_handles(
            data.get("extended_selected_accounts", []),
            candidate_by_handle,
            self.discovery_max_extended_accounts,
            self._candidate_monitor_priority_ok,
        )
        notes = str(data.get("notes", "")).strip()
        return core_requested, extended_requested, notes

    def _score_candidate(self, profile_text: str, candidate: dict, hydrate_samples: bool = True) -> None:
        self._hydrate_candidate_authority(candidate)
        if hydrate_samples:
            self._ensure_candidate_samples(candidate)

        tweet_lines = []
        for idx, tweet in enumerate(candidate.get("sample_tweets", [])[: self.discovery_sample_tweets], 1):
            label = "retweet" if tweet.get("is_retweet") else "post"
            tweet_lines.append(f"{idx}. [{label}] {tweet.get('text', '')}")
        tweets_context = "\n".join(tweet_lines) if tweet_lines else "No recent tweets available."

        prompt = f"""
You are scoring whether an X/Twitter account belongs in a domain-specific monitoring list.

Domain monitoring thesis:
{profile_text}

Candidate account:
- handle: @{candidate['screen_name']}
- name: {candidate.get('name', '')}
- followers_count: {candidate.get('followers_count', 0)}
- verified: {candidate.get('verified', False)}
- discovered_from: {', '.join(candidate.get('sources', []))}
- matched_queries: {', '.join(candidate.get('queries', []))}

Recent sample posts:
{tweets_context}

Decide whether this account should be in the final monitoring pool.

Decision rubric:
- include: clearly belongs in the monitoring list; this is a high-signal public account for the domain
- watch: somewhat relevant, but not strong enough yet
- exclude: weak fit, noisy, overly generic, or low-evidence
- This is a domain monitoring feed, not a collaborator feed
- Nearby people are not enough unless they are genuinely high-leverage public voices in the domain
- A single keyword hit is not enough if the account is not consistently about the domain
- First-hand signal is preferred over generic commentary
- The right kinds of accounts depend on the domain: this could mean researchers, founders, regulators, policymakers, official institutions, company accounts, journalists, investors, or developer accounts

Return JSON:
{{
  "decision": "include|watch|exclude",
  "score": 0-10,
  "category": "researcher|builder|company|lab|investor|media|community|policymaker|regulator|government|institution|journalist|other",
  "reason": "One concise English reason"
}}
"""
        try:
            data = self._call_json_model(prompt, temperature=0.1)
            candidate["discovery_decision"] = self._normalize_discovery_decision(str(data.get("decision", "exclude")))
            candidate["discovery_score"] = float(data.get("score", 0))
            candidate["discovery_category"] = str(data.get("category", "other")).strip() or "other"
            candidate["discovery_reason"] = str(data.get("reason", "")).strip()
        except Exception as e:
            print(f"[{self.name}] Candidate scoring failed for @{candidate['screen_name']}: {e}")
            candidate["discovery_decision"] = "watch"
            candidate["discovery_score"] = 0.0
            candidate["discovery_category"] = "other"
            candidate["discovery_reason"] = "automatic scoring failed"

        followers_count = int(candidate.get("followers_count", 0) or 0)
        verified = bool(candidate.get("verified", False))
        sample_tweets = candidate.get("sample_tweets", [])
        has_original_tweets = any(not item.get("is_retweet") for item in sample_tweets)
        source_set = set(candidate.get("sources", []))
        category = candidate.get("discovery_category", "other")

        if candidate["discovery_decision"] == "include":
            if not sample_tweets and 0 < followers_count < 1000:
                candidate["discovery_decision"] = "watch"
                candidate["discovery_score"] = min(candidate["discovery_score"], 6.0)
                candidate["discovery_reason"] += " Limited recent evidence and weak public reach; keep on watchlist instead."
            elif sample_tweets and not has_original_tweets and 0 < followers_count < 2000:
                candidate["discovery_decision"] = "watch"
                candidate["discovery_score"] = min(candidate["discovery_score"], 6.0)
                candidate["discovery_reason"] += " Recent activity is mostly retweets and public reach is limited; keep on watchlist instead."
            elif "people_search" not in source_set and not verified and followers_count == 0:
                candidate["discovery_decision"] = "watch"
                candidate["discovery_score"] = min(candidate["discovery_score"], 6.0)
                candidate["discovery_reason"] += " It only surfaced in topic search and lacks clear public-authority signals."
            elif not self._candidate_public_voice_bar(candidate):
                candidate["discovery_decision"] = "watch"
                candidate["discovery_score"] = min(candidate["discovery_score"], 6.5)
                candidate["discovery_reason"] += (
                    f" It is relevant but its public-authority signal is still weak (followers={followers_count}), "
                    "so it fits better as a secondary watch account than a core public voice."
                )
        candidate["_dirty"] = False

    def _score_candidate_pool(self, profile_text: str, candidate_pool: dict[str, dict]) -> None:
        ranked_candidates = sorted(
            candidate_pool.values(),
            key=self._candidate_sampling_priority,
            reverse=True,
        )
        scored_handles = {
            candidate["screen_name"]
            for candidate in ranked_candidates[: min(self.discovery_scoring_budget, len(ranked_candidates))]
        }
        for candidate in ranked_candidates:
            if candidate.get("_dirty", True):
                if candidate["screen_name"] not in scored_handles and not candidate.get("sample_tweets"):
                    self._heuristic_seed_candidate(candidate)
                    continue
                # Avoid expensive timeline fetches during broad discovery rounds.
                # Use live samples only when the candidate already surfaced from topic
                # search; detailed timeline hydration happens later on the shortlist.
                hydrate_samples = bool(candidate.get("sample_tweets"))
                self._score_candidate(profile_text, candidate, hydrate_samples=hydrate_samples)

    def _refresh_final_candidate_details(self, profile_text: str, candidate_pool: dict[str, dict]) -> None:
        ranked_candidates = sorted(
            candidate_pool.values(),
            key=lambda item: (
                item.get("discovery_decision") == "include",
                item.get("discovery_score", 0),
                self._candidate_sampling_priority(item),
            ),
            reverse=True,
        )
        detail_budget = min(len(ranked_candidates), max(self.discovery_max_core_accounts + 8, 18))
        for candidate in ranked_candidates[:detail_budget]:
            candidate["_dirty"] = True
            self._score_candidate(profile_text, candidate, hydrate_samples=True)

    def _search_discovery_queries(
        self,
        plan: dict,
        candidate_pool: dict[str, dict],
        searched_queries: dict[str, set[str]],
    ) -> tuple[int, int, int]:
        people_hits = 0
        organization_hits = 0
        topic_hits = 0

        for query in plan["people_queries"]:
            results = self._search_people_query_variants(query, searched_queries["people"])
            people_hits += len(results)
            for item in results:
                self._upsert_candidate(
                    candidate_pool,
                    screen_name=item.get("screen_name", ""),
                    name=item.get("name", ""),
                    followers_count=item.get("followers_count", 0),
                    verified=item.get("verified", False),
                    source="people_search",
                    query=query,
                )

        for query in plan.get("organization_queries", []):
            results = self._search_people_query_variants(query, searched_queries["organization"])
            organization_hits += len(results)
            for item in results:
                self._upsert_candidate(
                    candidate_pool,
                    screen_name=item.get("screen_name", ""),
                    name=item.get("name", ""),
                    followers_count=item.get("followers_count", 0),
                    verified=item.get("verified", False),
                    source="organization_search",
                    query=query,
                )

        for query in plan["topic_queries"]:
            normalized = query.strip().lower()
            if not normalized or normalized in searched_queries["topic"]:
                continue
            searched_queries["topic"].add(normalized)

            tweets = search_top_tweets_rapidapi(
                query=query,
                api_key=self.api_key,
                api_host=self.api_host,
                max_results=self.discovery_search_results_per_query,
                timeout=self.discovery_search_timeout,
            )
            topic_hits += len(tweets)
            for tweet in tweets:
                self._upsert_candidate(
                    candidate_pool,
                    screen_name=tweet.get("author_username", ""),
                    name=tweet.get("author_name", ""),
                    followers_count=0,
                    source="topic_search",
                    query=query,
                    sample_tweet=tweet,
                )

        return people_hits, organization_hits, topic_hits

    def discover_accounts(self, profile_text: str) -> tuple[list[str], dict]:
        circle_profile = self._build_circle_profile(profile_text)
        discovery_context = self._format_circle_profile(circle_profile) or profile_text
        candidate_pool: dict[str, dict] = {}
        searched_queries = {"people": set(), "organization": set(), "topic": set()}
        round_logs = []

        print(f"[{self.name}] Starting profile-driven account discovery")

        for round_index in range(self.discovery_rounds):
            plan = self._plan_discovery_queries(discovery_context, round_index, searched_queries, candidate_pool)
            if not plan["people_queries"] and not plan.get("organization_queries") and not plan["topic_queries"]:
                print(f"[{self.name}] Discovery round {round_index + 1}: no new queries, stopping")
                break

            print(
                f"[{self.name}] Discovery round {round_index + 1}: "
                f"people={plan['people_queries']} "
                f"orgs={plan.get('organization_queries', [])} "
                f"topic={plan['topic_queries']}"
            )

            people_hits, organization_hits, topic_hits = self._search_discovery_queries(
                plan,
                candidate_pool,
                searched_queries,
            )
            self._score_candidate_pool(discovery_context, candidate_pool)
            candidate_pool = self._prune_candidate_pool(candidate_pool)

            print(
                f"[{self.name}] Discovery round {round_index + 1}: "
                f"{people_hits} people hits, {organization_hits} org hits, "
                f"{topic_hits} topic hits, {len(candidate_pool)} candidates"
            )

            ranked_candidates = sorted(
                candidate_pool.values(),
                key=lambda item: (item.get("discovery_score", 0), item.get("followers_count", 0)),
                reverse=True,
            )
            round_logs.append(
                {
                    "round": round_index + 1,
                    "plan": plan,
                    "people_hits": people_hits,
                    "organization_hits": organization_hits,
                    "topic_hits": topic_hits,
                    "top_candidates": [
                        {
                            "screen_name": item["screen_name"],
                            "score": item.get("discovery_score", 0),
                            "decision": item.get("discovery_decision", "unknown"),
                            "category": item.get("discovery_category", "unknown"),
                        }
                        for item in ranked_candidates[:5]
                    ],
                }
            )

        preview_candidates = sorted(
            candidate_pool.values(),
            key=lambda item: (
                item.get("discovery_decision") == "include",
                item.get("discovery_score", 0),
                item.get("followers_count", 0),
            ),
            reverse=True,
        )
        preview_selected = [
            item["screen_name"]
            for item in preview_candidates[: min(self.discovery_max_core_accounts, len(preview_candidates))]
        ]
        for expansion_index in range(self.discovery_expansion_rounds):
            coverage_plan = self._plan_coverage_gap_queries(discovery_context, candidate_pool, preview_selected)
            has_queries = (
                coverage_plan.get("people_queries")
                or coverage_plan.get("organization_queries")
                or coverage_plan.get("topic_queries")
            )
            if coverage_plan.get("coverage_ok", False) and not has_queries:
                break
            if not has_queries:
                break

            print(
                f"[{self.name}] Coverage expansion {expansion_index + 1}: "
                f"people={coverage_plan.get('people_queries', [])} "
                f"orgs={coverage_plan.get('organization_queries', [])} "
                f"topic={coverage_plan.get('topic_queries', [])}"
            )
            people_hits, organization_hits, topic_hits = self._search_discovery_queries(
                coverage_plan,
                candidate_pool,
                searched_queries,
            )
            self._score_candidate_pool(discovery_context, candidate_pool)
            candidate_pool = self._prune_candidate_pool(candidate_pool)

            preview_candidates = sorted(
                candidate_pool.values(),
                key=lambda item: (
                    item.get("discovery_decision") == "include",
                    item.get("discovery_score", 0),
                    item.get("followers_count", 0),
                ),
                reverse=True,
            )
            preview_selected = [
                item["screen_name"]
                for item in preview_candidates[: min(self.discovery_max_core_accounts, len(preview_candidates))]
            ]
            round_logs.append(
                {
                    "round": f"coverage_expansion_{expansion_index + 1}",
                    "plan": coverage_plan,
                    "people_hits": people_hits,
                    "organization_hits": organization_hits,
                    "topic_hits": topic_hits,
                    "top_candidates": [
                        {
                            "screen_name": item["screen_name"],
                            "score": item.get("discovery_score", 0),
                            "decision": item.get("discovery_decision", "unknown"),
                            "category": item.get("discovery_category", "unknown"),
                        }
                        for item in preview_candidates[:10]
                    ],
                }
            )

            if people_hits + organization_hits + topic_hits == 0:
                break

        final_candidates = sorted(
            candidate_pool.values(),
            key=lambda item: (
                item.get("discovery_decision") == "include",
                item.get("discovery_score", 0),
                item.get("followers_count", 0),
            ),
            reverse=True,
        )
        self._refresh_final_candidate_details(discovery_context, candidate_pool)
        final_candidates = sorted(
            candidate_pool.values(),
            key=lambda item: (
                item.get("discovery_decision") == "include",
                item.get("discovery_score", 0),
                item.get("followers_count", 0),
            ),
            reverse=True,
        )

        core_requested, extended_requested, selection_notes = self._select_account_tiers(
            discovery_context,
            final_candidates,
        )
        core_selected_accounts = self._top_up_selected_accounts(
            core_requested,
            final_candidates,
            self.discovery_max_core_accounts,
            self._candidate_core_priority_ok,
            self._candidate_monitor_priority_ok,
        )
        extended_seed = self._merge_accounts(core_selected_accounts, extended_requested)
        extended_selected_accounts = self._top_up_selected_accounts(
            extended_seed,
            final_candidates,
            self.discovery_max_extended_accounts,
            self._candidate_monitor_priority_ok,
            lambda candidate: (
                candidate.get("discovery_decision") != "exclude"
                and self._candidate_public_voice_bar(candidate)
            ),
        )
        selected_accounts = extended_selected_accounts

        discovery_result = {
            "profile_text": profile_text,
            "circle_profile": circle_profile,
            "profile_sources": self.discovery_profile_sources,
            "selection_notes": selection_notes,
            "core_selected_accounts": core_selected_accounts,
            "extended_selected_accounts": extended_selected_accounts,
            "selected_accounts": selected_accounts,
            "candidates": final_candidates,
            "rounds": round_logs,
        }
        print(f"[{self.name}] Discovery core accounts: {core_selected_accounts}")
        print(f"[{self.name}] Discovery extended accounts: {extended_selected_accounts}")
        return selected_accounts, discovery_result

    def _save_discovery_outputs(self) -> None:
        if not self.save_dir or not self.discovery_result:
            return

        json_path = os.path.join(self.save_dir, "discovered_accounts.json")
        txt_path = os.path.join(self.save_dir, "discovered_accounts.txt")
        core_txt_path = os.path.join(self.save_dir, "discovered_accounts.core.txt")
        extended_txt_path = os.path.join(self.save_dir, "discovered_accounts.extended.txt")

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(self.discovery_result, f, ensure_ascii=False, indent=2)
        self._write_account_list(txt_path, self.discovery_result.get("selected_accounts", []))
        self._write_account_list(core_txt_path, self.discovery_result.get("core_selected_accounts", []))
        self._write_account_list(extended_txt_path, self.discovery_result.get("extended_selected_accounts", []))

        print(
            f"[{self.name}] Discovery outputs saved to {json_path}, {txt_path}, "
            f"{core_txt_path}, and {extended_txt_path}"
        )

    def fetch_items(self) -> list[dict]:
        filtered = []
        for tweet in self.tweets:
            retweet_flag_trusted = tweet.get("_x_retweet_flag_trusted", True)
            reply_flag_trusted = tweet.get("_x_reply_flag_trusted", False)

            if retweet_flag_trusted and self.skip_retweets and tweet.get("is_retweet", False):
                continue
            if reply_flag_trusted and not self.include_replies and tweet.get("is_reply", False):
                continue
            filtered.append(tweet)
        print(
            f"[{self.name}] {len(filtered)} tweets after filtering "
            f"(skip_retweets={self.skip_retweets}, include_replies={self.include_replies})"
        )
        return filtered

    def build_eval_prompt(self, item: dict) -> str:
        prompt = """
            你是一个有帮助的AI助手，帮助我追踪Twitter/X上的重要动态。
            以下是我感兴趣的领域描述：
            {}
        """.format(self.description)

        tweet_context = f"""
            以下是一条来自 @{item['author_username']} 的推文：
            内容: {item['text']}
            互动数据: ❤️ {item.get('likes', 0)} | 🔁 {item.get('retweets', 0)} | 💬 {item.get('replies', 0)}
        """
        if item.get("is_quote") and item.get("quoted_text"):
            tweet_context += f"""
            引用推文 (@{item.get('quoted_author', 'unknown')}): {item['quoted_text']}
            """

        prompt += tweet_context
        prompt += """
            请评估这条推文：
            1. 用中文简要总结这条推文的核心内容（1-2句话）。
            2. 判断推文类型：观点/新闻/讨论/分享/公告/日常。
            3. 评估这条推文与我兴趣领域的相关性，并给出 0-10 的评分。其中 0 表示完全不相关，10 表示高度相关。
            4. 列出 1-3 个关键要点。

            请按以下 JSON 格式给出你的回答：
            {
                "summary": "一段纯文本的中文总结（不要嵌套JSON/dict，直接写一段话）",
                "category": "观点/新闻/讨论/分享/公告/日常",
                "relevance": <你的评分>,
                "key_points": ["要点1", "要点2"]
            }
            重要：summary 必须是一段纯文本字符串，不要返回嵌套的 JSON 对象或字典。
            使用中文回答。
            直接返回上述 JSON 格式，无需任何额外解释。
        """
        return prompt

    def parse_eval_response(self, item: dict, response: str) -> dict:
        data = self._load_json_response(response)
        return {
            "title": f"@{item['author_username']}: {item['text'][:60]}",
            "tweet_id": item["tweet_id"],
            "text": item["text"],
            "author_username": item["author_username"],
            "author_name": item.get("author_name", item["author_username"]),
            "created_at": item.get("created_at", ""),
            "likes": item.get("likes", 0),
            "retweets": item.get("retweets", 0),
            "replies": item.get("replies", 0),
            "is_retweet": item.get("is_retweet", False),
            "is_reply": item.get("is_reply", False),
            "is_quote": item.get("is_quote", False),
            "quoted_text": item.get("quoted_text", ""),
            "quoted_author": item.get("quoted_author", ""),
            "summary": self._ensure_str(data["summary"]),
            "category": data.get("category", "日常"),
            "score": float(data["relevance"]),
            "key_points": data.get("key_points", []),
            "url": item.get("tweet_url", ""),
        }

    def render_item_html(self, item: dict) -> str:
        rate = get_stars(item.get("score", 0))
        return get_tweet_block_html(
            author_username=item["author_username"],
            author_name=item.get("author_name", item["author_username"]),
            rate=rate,
            text=item["text"],
            summary=item["summary"],
            category=item.get("category", "日常"),
            tweet_url=item.get("url", ""),
            likes=item.get("likes", 0),
            retweets=item.get("retweets", 0),
            replies=item.get("replies", 0),
            is_retweet=item.get("is_retweet", False),
            is_reply=item.get("is_reply", False),
            is_quote=item.get("is_quote", False),
            quoted_text=item.get("quoted_text", ""),
            quoted_author=item.get("quoted_author", ""),
            created_at=item.get("created_at", ""),
            key_points=item.get("key_points", []),
            score=float(item.get("score", 0) or 0),
        )

    def get_item_cache_id(self, item: dict) -> str:
        return f"tweet_{item['tweet_id']}"

    def get_section_header(self) -> str:
        return '<div class="section-title" style="border-bottom-color: #1d9bf0;">𝕏 X/Twitter 关键动态</div>'

    def get_theme_color(self) -> str:
        return "29,155,240"

    def get_max_items(self) -> int:
        return self.max_tweets

    @staticmethod
    def _format_report_time(created_at: str) -> str:
        if not created_at:
            return ""
        try:
            return datetime.fromisoformat(created_at).astimezone().strftime("%Y-%m-%d %H:%M")
        except ValueError:
            return created_at

    def build_summary_overview(self, recommendations: list[dict]) -> str:
        overview = ""
        for i, item in enumerate(recommendations):
            engagement = f"❤️ {item.get('likes', 0)} | 🔁 {item.get('retweets', 0)} | 💬 {item.get('replies', 0)}"
            key_points = "；".join(item.get("key_points", [])[:3])
            overview += (
                f"{i + 1}. @{item['author_username']} | {item.get('author_name', item['author_username'])} | "
                f"类型={item.get('category', '')} | 分数={item.get('score', 0)} | "
                f"时间={self._format_report_time(item.get('created_at', ''))} | "
                f"摘要={item['summary']} | 要点={key_points} | 互动={engagement}\n"
            )
        return overview

    def get_summary_prompt_template(self) -> str:
        return """
            请直接输出一段 HTML 片段，不要包含 JSON、Markdown 或多余说明。
            不要再输出外层 <div class="summary-wrapper">，系统会自动包裹。
            请使用下面这些 section 结构：
              <div class="summary-section">
                <h2>今日一览</h2>
                <p>用 2-4 句话总结今天 X/Twitter 上最值得知道的整体变化，优先写“谁说了什么、哪些机构有动作、哪些话题升温”。</p>
              </div>
              <div class="summary-section">
                <h2>必读动态</h2>
                <ol class="summary-list">
                  <li class="summary-item">
                    <div class="summary-item__header"><span class="summary-item__title">@用户名 / 机构：一句话概括</span><span class="summary-pill">类型</span></div>
                    <p><strong>发生了什么：</strong>...</p>
                    <p><strong>为什么值得看：</strong>...</p>
                    <p class="summary-item__stars"><strong>互动：</strong>❤️ / 🔁 / 💬 ...</p>
                  </li>
                </ol>
              </div>
              <div class="summary-section">
                <h2>延伸观察</h2>
                <p>补充今天跨账号的共同趋势、争议点或后续值得盯的方向。</p>
              </div>

            用中文撰写内容。
            “必读动态”建议返回 4-6 条，优先选择真正有信息增量的账号或机构动作，不要重复同一件事。
        """

    def _save_markdown(self, recommendations: list[dict]):
        save_path = os.path.join(self.save_dir, f"{self.run_date}.md")
        with open(save_path, "w", encoding="utf-8") as f:
            f.write("# X/Twitter 关键动态日报\n")
            f.write(f"## 日期：{self.run_date}\n\n")
            for i, item in enumerate(recommendations, 1):
                name = item.get("author_name", item.get("author_username", "unknown"))
                handle = item.get("author_username", "unknown")
                f.write(f"### {i}. {name} (@{handle})\n")
                f.write(
                    f"- 类型：{item.get('category', '日常')} | 相关度：{item.get('score', 0):.1f}/10"
                    f" | 时间：{self._format_report_time(item.get('created_at', '')) or '未知'}\n"
                )
                f.write(
                    f"- 互动：❤️ {item.get('likes', 0)} | 🔁 {item.get('retweets', 0)} | 💬 {item.get('replies', 0)}\n"
                )
                f.write(f"- 摘要：{item.get('summary', 'N/A')}\n")
                key_points = item.get("key_points", [])
                if key_points:
                    f.write("- 要点：\n")
                    for point in key_points[:3]:
                        f.write(f"  - {point}\n")
                excerpt = str(item.get("text", "")).replace("\n", " ").strip()
                if excerpt:
                    excerpt = excerpt[:180] + "..." if len(excerpt) > 180 else excerpt
                    f.write(f"- 原文摘录：{excerpt}\n")
                f.write(f"- 链接：{item.get('url', '')}\n\n")
