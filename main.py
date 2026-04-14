import argparse
import os
from core.config import LLMConfig, EmailConfig, CommonConfig, load_dotenv
from sources import SOURCE_REGISTRY


def env_str(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value in (None, ""):
        return default
    return value


def env_int(name: str, default: int | None = None) -> int | None:
    value = os.getenv(name)
    if value in (None, ""):
        return default
    return int(value)


def env_float(name: str, default: float | None = None) -> float | None:
    value = os.getenv(name)
    if value in (None, ""):
        return default
    return float(value)


def main():
    load_dotenv()
    provider_default = env_str("PROVIDER", "openai")
    model_default = env_str("MODEL_NAME")
    base_url_default = env_str("BASE_URL")
    api_key_default = env_str("API_KEY")
    temperature_default = env_str("TEMPERATURE")

    parser = argparse.ArgumentParser(description="Unified Daily Recommender")

    parser.add_argument(
        "--sources", nargs="+",
        choices=list(SOURCE_REGISTRY.keys()),
        help=f"Information sources to run: {list(SOURCE_REGISTRY.keys())}",
    )

    # LLM config
    parser.add_argument(
        "--provider", type=str,
        default=provider_default,
        help="LLM provider (default: openai; configurable via PROVIDER in .env)",
    )
    parser.add_argument(
        "--model", type=str,
        default=model_default,
        help="Model name (configured via MODEL_NAME in .env)",
    )
    parser.add_argument(
        "--base_url", type=str, default=base_url_default,
        help="API base URL (configured via BASE_URL in .env)",
    )
    parser.add_argument(
        "--api_key", type=str, default=api_key_default,
        help="API key (configured via API_KEY in .env)",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=float(temperature_default) if temperature_default not in (None, "") else 0.7,
        help="Temperature (configured via TEMPERATURE in .env)",
    )

    # Email config
    parser.add_argument("--smtp_server", type=str, default=env_str("SMTP_SERVER"), help="SMTP server")
    parser.add_argument("--smtp_port", type=int, default=env_int("SMTP_PORT"), help="SMTP port")
    parser.add_argument("--sender", type=str, default=env_str("SMTP_SENDER"), help="Sender email")
    parser.add_argument(
        "--receiver", type=str, default=env_str("SMTP_RECEIVER"), help="Receiver email(s), comma separated"
    )
    parser.add_argument(
        "--sender_password", type=str, default=env_str("SMTP_PASSWORD"), help="Sender email password"
    )

    # Common config
    parser.add_argument(
        "--description", type=str, default=os.getenv("DESCRIPTION_FILE", "profiles/description.txt"),
        help="Interest description file path"
    )
    parser.add_argument(
        "--num_workers", type=int, default=env_int("NUM_WORKERS", 4), help="Number of parallel workers"
    )
    parser.add_argument("--save", action="store_true", help="Save results to history")
    parser.add_argument("--save_dir", type=str, default="./history", help="History save directory")
    parser.add_argument("--profile_hash", type=str, default="", help="Pre-computed profile hash for cache isolation")
    parser.add_argument("--state_dir", type=str, default="./state", help="State directory for caches")
    parser.add_argument(
        "--skip_source_emails",
        action="store_true",
        help="Generate source outputs without sending per-source emails",
    )
    parser.add_argument(
        "--cache_clean",
        nargs="*",
        default=None,
        help="Clear caches before running. Targets: all, fetch, eval, history, ideas, reports",
    )
    parser.add_argument(
        "--cache_clean_before",
        type=str,
        default=None,
        help="Only clean cache entries older than this date (YYYY-MM-DD)",
    )

    # Idea generation config
    parser.add_argument("--generate_ideas", action="store_true", help="Generate research ideas from recommendations")
    parser.add_argument("--researcher_profile", type=str, default="profiles/researcher_profile.md",
                        help="Path to researcher profile for idea generation")
    parser.add_argument("--idea_min_score", type=float, default=7, help="Min score for idea generation input")
    parser.add_argument("--idea_max_items", type=int, default=15, help="Max items to feed into idea generator")
    parser.add_argument("--idea_count", type=int, default=5, help="Number of ideas to generate")

    # Cross-source report config
    parser.add_argument("--generate_report", action="store_true", help="Generate a personalized cross-source report")
    parser.add_argument(
        "--report_profile",
        type=str,
        default=env_str("REPORT_PROFILE_FILE"),
        help="Profile file used for cross-source report generation",
    )
    parser.add_argument(
        "--report_title",
        type=str,
        default=env_str("REPORT_TITLE", "Daily Personal Briefing"),
        help="Title for the cross-source report",
    )
    parser.add_argument(
        "--report_min_score",
        type=float,
        default=env_float("REPORT_MIN_SCORE", 4.0),
        help="Minimum item score to include in cross-source report curation",
    )
    parser.add_argument(
        "--report_max_items",
        type=int,
        default=env_int("REPORT_MAX_ITEMS", 18),
        help="Maximum number of curated items fed into the report generator",
    )
    parser.add_argument(
        "--report_theme_count",
        type=int,
        default=env_int("REPORT_THEME_COUNT", 4),
        help="Maximum number of top themes in the cross-source report",
    )
    parser.add_argument(
        "--report_prediction_count",
        type=int,
        default=env_int("REPORT_PREDICTION_COUNT", 4),
        help="Maximum number of predictions in the cross-source report",
    )
    parser.add_argument(
        "--report_idea_count",
        type=int,
        default=env_int("REPORT_IDEA_COUNT", 4),
        help="Maximum number of ideas in the cross-source report",
    )
    parser.add_argument(
        "--send_report_email",
        action="store_true",
        help="Send the generated cross-source report as an email",
    )

    # Register each source's specific arguments
    for source_name, source_cls in SOURCE_REGISTRY.items():
        source_cls.add_arguments(parser)

    args = parser.parse_args()

    # Handle cache clean (can run standalone without --sources)
    if args.cache_clean is not None:
        from pipeline.agent_bridge import cache_clean
        targets = args.cache_clean if args.cache_clean else ["all"]
        cache_clean(targets, before=args.cache_clean_before)
        if not args.sources:
            print("Cache clean complete.")
            return

    if not args.sources:
        parser.error("--sources is required (unless running --cache_clean only)")
    if not args.model:
        parser.error("--model is required (set MODEL_NAME in .env or pass --model)")

    # Validate LLM config
    if args.generate_ideas and not args.save:
        raise ValueError("--generate_ideas requires --save so ideas.json is available for /idea-from-daily")
    if args.generate_ideas and not os.path.exists(args.researcher_profile):
        raise FileNotFoundError(f"Researcher profile not found: {args.researcher_profile}")
    if args.report_profile and not os.path.exists(args.report_profile):
        raise FileNotFoundError(f"Report profile not found: {args.report_profile}")
    provider = args.provider.lower()
    resolved_base_url = args.base_url
    resolved_api_key = args.api_key
    if provider != "ollama":
        assert resolved_base_url, "base_url is required for OpenAI/SiliconFlow"
        assert resolved_api_key, "api_key is required for OpenAI/SiliconFlow"

    # Load description
    with open(args.description, "r", encoding="utf-8") as f:
        description_text = f.read()

    # Compute profile hash for cache isolation
    from core.cache_utils import stable_profile_hash
    profile_hash = getattr(args, "profile_hash", "") or stable_profile_hash(description_text)

    # Build configs
    llm_config = LLMConfig(
        provider=args.provider,
        model=args.model,
        base_url=resolved_base_url,
        api_key=resolved_api_key,
        temperature=args.temperature,
    )
    email_config = EmailConfig(
        smtp_server=args.smtp_server,
        smtp_port=args.smtp_port,
        sender=args.sender,
        receiver=args.receiver,
        sender_password=args.sender_password,
    )
    common_config = CommonConfig(
        description=description_text,
        num_workers=args.num_workers,
        save=args.save,
        save_dir=args.save_dir,
        profile_hash=profile_hash,
        state_dir=args.state_dir,
    )

    print("Testing LLM availability...")
    if llm_config.provider.lower() == "ollama":
        from llm.Ollama import Ollama
        test_model = Ollama(llm_config.model)
    else:
        from llm.GPT import GPT
        test_model = GPT(llm_config.model, llm_config.base_url, llm_config.api_key)
    try:
        test_model.inference("Hello, who are you?")
        print("LLM is available.")
    except Exception as e:
        print(f"LLM test failed: {e}")
        raise RuntimeError("LLM not available, aborting.")

    # Run each source (parallel when multiple sources)
    all_recs = {}

    def _run_source(source_name: str) -> tuple[str, list[dict]]:
        print(f"\n[{source_name}] {'='*50}")
        print(f"[{source_name}] Starting source")
        print(f"[{source_name}] {'='*50}")

        source_cls = SOURCE_REGISTRY[source_name]
        source_args = source_cls.extract_args(args)

        source = source_cls(source_args, llm_config, common_config)
        if args.skip_source_emails:
            recs = source.get_recommendations()
            source.render_email(recs)
        else:
            recs = source.send_email(email_config)

        print(f"[{source_name}] Completed with {len(recs or [])} recommendations")
        return source_name, recs or []

    if len(args.sources) >= 2:
        from concurrent.futures import ThreadPoolExecutor, as_completed

        print(f"\nRunning {len(args.sources)} sources in parallel: {args.sources}")
        with ThreadPoolExecutor(max_workers=len(args.sources)) as executor:
            futures = {executor.submit(_run_source, name): name for name in args.sources}
            for future in as_completed(futures):
                name = futures[future]
                try:
                    source_name, recs = future.result()
                    all_recs[source_name] = recs
                except Exception as e:
                    print(f"[{name}] Source failed: {e}")
                    all_recs[name] = []
    else:
        for source_name in args.sources:
            _, recs = _run_source(source_name)
            all_recs[source_name] = recs

    if args.generate_report:
        print(f"\n{'='*60}")
        print("Generating cross-source report...")
        print(f"{'='*60}")

        from pipeline.report_generator import ReportGenerator

        report_profile_path = args.report_profile
        if not report_profile_path:
            if os.path.exists(args.researcher_profile):
                report_profile_path = args.researcher_profile
            else:
                report_profile_path = args.description

        with open(report_profile_path, "r", encoding="utf-8") as f:
            report_profile_text = f.read()

        generator = ReportGenerator(
            all_recs=all_recs,
            profile_text=report_profile_text,
            llm_config=llm_config,
            common_config=common_config,
            report_title=args.report_title,
            min_score=args.report_min_score,
            max_items=args.report_max_items,
            theme_count=args.report_theme_count,
            prediction_count=args.report_prediction_count,
            idea_count=args.report_idea_count,
        )
        report = generator.generate()
        if report:
            generator.save(report)
            generator.render_email(report)
            if args.send_report_email:
                generator.send_email(report, email_config)
        else:
            print("No cross-source report generated.")

    if args.generate_ideas:
        print(f"\n{'='*60}")
        print("Generating research ideas...")
        print(f"{'='*60}")

        from pipeline.idea_generator import IdeaGenerator

        generator = IdeaGenerator(
            all_recs=all_recs,
            profile_path=args.researcher_profile,
            llm_config=llm_config,
            common_config=common_config,
            min_score=args.idea_min_score,
            max_items=args.idea_max_items,
            idea_count=args.idea_count,
        )
        ideas = generator.generate()
        if ideas:
            generator.save(ideas)
            generator.render_email(ideas)
            if args.skip_source_emails:
                print("[IdeaGenerator] Skip idea email because --skip_source_emails is enabled.")
            else:
                generator.send_email(ideas, email_config)
        else:
            print("No ideas generated.")

    print(f"\nAll sources completed: {args.sources}")


if __name__ == "__main__":
    main()
