# Daily Recommender Technical Documentation

## 1. System Architecture

The system uses a plugin-based architecture. Each data source (GitHub, HuggingFace, future arXiv, etc.) implements the `BaseSource` abstract class and registers in `SOURCE_REGISTRY`. Shared modules (LLM, email, caching) are reused across all sources.

Run with `--sources github huggingface twitter` to select sources. Each source independently fetches data, evaluates with LLM, renders HTML, and sends email.

### Directory Structure

```
daily-recommender/
  main.py                          # Unified CLI entry point
  config.py                        # Config dataclasses (LLMConfig, EmailConfig, CommonConfig)
  base_source.py                   # BaseSource abstract base class
  description.txt                  # User interest description
  requirements.txt
  main_gpt.sh                      # Launch script
  x_accounts.txt                   # X accounts to monitor
  sources/
    __init__.py                    # SOURCE_REGISTRY
    github_source.py               # GitHubSource(BaseSource)
    huggingface_source.py          # HuggingFaceSource(BaseSource)
    twitter_source.py              # TwitterSource(BaseSource)
  llm/
    __init__.py
    GPT.py                         # OpenAI-compatible API
    Ollama.py                      # Ollama local model
  fetchers/
    __init__.py
    github_fetcher.py              # GitHub Trending scraper
    huggingface_fetcher.py         # HuggingFace API client
    twitter_fetcher.py             # RapidAPI twitter-api45 client
  email_utils/
    __init__.py
    base_template.py               # Shared HTML framework, stars, summary styles
    github_template.py             # GitHub repo card template
    huggingface_template.py        # HF paper/model card templates
    twitter_template.py            # X/Twitter tweet card template
  history/                         # Cache organized by source/date
    github/{date}/json/
    huggingface/{date}/json/
    twitter/{date}/json/
```

## 2. Setup and Running

### Install Dependencies

```bash
pip install -r requirements.txt
```

Dependencies: tqdm, loguru, requests, beautifulsoup4, openai, ollama (optional)

### Configuration

`main.py` and `main_gpt.sh` will auto-load `.env` from the project root. Put `MODEL_NAME`, `BASE_URL`, `API_KEY`, `SMTP_*`, and `X_RAPIDAPI_*` there if you don't want to pass them on the CLI. Legacy `LLM_*` variables are still accepted as fallbacks for compatibility. Edit `description.txt` with your interest areas.

### Run

```bash
bash main_gpt.sh                              # Run the sources configured in .env / script defaults
python main.py --sources github [args...]      # GitHub only
python main.py --sources huggingface [args...] # HuggingFace only
python main.py --sources twitter [args...]     # Twitter/X only
```

### Cron Job

```bash
0 8 * * * /var/www/daily-recommender/main_gpt.sh >> /var/log/daily-recommender.log 2>&1
```

## 3. Plugin Architecture: BaseSource

### Abstract Methods (subclass must implement)

| Method | Purpose | Returns |
|--------|---------|---------|
| `add_arguments(parser)` | Register source-specific CLI args | - |
| `extract_args(args)` | Extract source args from parsed args | dict |
| `fetch_items()` | Fetch raw items from data source | list[dict] |
| `build_eval_prompt(item)` | Build LLM evaluation prompt for one item | str |
| `parse_eval_response(item, response)` | Parse LLM JSON response, must include `score` key | dict |
| `render_item_html(item)` | Render one recommendation as HTML card | str |
| `get_item_cache_id(item)` | Return unique cache filename (no extension) | str |
| `build_summary_overview(recs)` | Build text overview for summary LLM prompt | str |
| `get_summary_prompt_template()` | Return HTML template instruction for summary | str |
| `get_section_header()` | Return section header HTML for email | str |

### Built-in Methods (inherited, no override needed)

| Method | Purpose |
|--------|---------|
| `process_item(item)` | LLM eval with caching, 5x retry, thread-safe writes |
| `get_recommendations()` | Full pipeline: fetch -> parallel process -> sort by score -> top N |
| `summarize(recs)` | LLM-generated HTML summary |
| `render_email(recs)` | Full email HTML (summary + item cards) |
| `send_email(email_config)` | SMTP send with TLS/SSL fallback |

### Hook Methods (override to customize)

| Method | Default | Purpose |
|--------|---------|---------|
| `get_max_items()` | 30 | Max recommendations |
| `get_theme_color()` | "36,41,46" (gray) | RGB theme color for summary styles |

## 4. Data Flow

```
1. main.py parses CLI args
2. Tests LLM availability once
3. For each source in --sources:
   a. Source.__init__: init LLM + fetch raw data from source
   b. get_recommendations():
      - fetch_items()             -> raw item list
      - ThreadPoolExecutor        -> parallel process_item()
        - process_item():
          - check cache           -> hit: return cached
          - build_eval_prompt()   -> prompt string
          - model.inference()     -> call LLM
          - parse_eval_response() -> structured result
          - write cache
      - sort by score desc -> take top N
   c. render_email(recommendations):
      - check email HTML cache
      - summarize()               -> LLM summary HTML
      - render_item_html() x N    -> item cards
      - assemble full HTML
   d. send_email()                -> SMTP send
4. All sources complete
```

## 5. Source Implementations

### GitHubSource

- **Data source**: GitHub Trending page (HTML scraper)
- **Source-specific args**: `--gh_languages`, `--gh_since`, `--gh_max_repos`
- **Scoring**: relevance (0-10, how related to user interests)
- **LLM output**: summary + category + relevance + highlights
- **Theme**: Gray (#24292e)
- **Card features**: Language badges (18 colors), star/fork stats, star data in summary recommendations

### HuggingFaceSource

- **Data source**: HuggingFace API
  - Papers: `https://huggingface.co/api/daily_papers`
  - Models: `https://huggingface.co/api/models?sort=likes&direction=-1`
- **Source-specific args**: `--hf_content_type`, `--hf_max_papers`, `--hf_max_models`
- **Scoring**: Papers use relevance, Models use usefulness (both 0-10)
- **Sorting**: Papers and models sorted independently then combined
- **Theme**: Orange (#ff6f00)
- **Card features**: Papers (yellow bg + orange button), Models (blue bg + blue button), separate sections

### TwitterSource

- **Data source**: RapidAPI `twitter-api45`
  - Account search: `search.php?search_type=People`
  - Topic search: `search.php?search_type=Top`
  - Timeline fetch: `timeline.php?screenname=<handle>`
- **Current integration**: This repo uses account timelines from `x_accounts.txt` and fetches recent posts via `timeline.php`
- **Optional account discovery**: You can enable profile-driven account discovery before tweet fetching. The source will:
  - read a profile from `--x_profile_file`, `--x_profile_urls`, or fall back to `description.txt`
  - ask the LLM to propose person queries, organization queries, and topic queries
  - search X iteratively via `People` and `Top`, then run one or more coverage-expansion passes to fill missing role buckets
  - classify candidates into `include/watch/exclude`
  - build two monitoring tiers:
    - `core_selected_accounts`: the smaller must-watch list
    - `extended_selected_accounts`: the broader watchlist used for richer monitoring coverage
  - save `discovered_accounts.json`, `discovered_accounts.txt`, `discovered_accounts.core.txt`, and `discovered_accounts.extended.txt` under `history/twitter/<date>/`
  - persist the broader watchlist to `x_accounts.discovered.txt` (or a custom `--x_discovery_persist_file`) and also persist companion `*.core.txt` / `*.extended.txt` files so later runs can monitor the same pool without rediscovery
- **Source-specific args**: `--x_accounts_file`, `--x_rapidapi_key`, `--x_rapidapi_host`, `--x_since_hours`, `--x_max_tweets_per_user`, `--x_max_tweets`
- **Filtering**: Retweets are filtered reliably; reply filtering is best-effort because the endpoint does not provide a dedicated reply flag on every item shape
- **Theme**: Blue (#1d9bf0)
- **Card features**: Tweet body, engagement stats, optional quoted text, tweet URL

### Overridden Methods

HuggingFaceSource overrides `get_recommendations()` and `render_email()` to handle papers and models as separate categories with independent sorting and rendering sections.

## 6. Extending with New Sources

Steps to add a new source:

1. Create `fetchers/xxx_fetcher.py` with data fetch functions
2. Create `email_utils/xxx_template.py` with card rendering functions
3. Create `sources/xxx_source.py` inheriting from BaseSource, implement all abstract methods
4. Register in `sources/__init__.py`:

```python
SOURCE_REGISTRY = {
    "github": GitHubSource,
    "huggingface": HuggingFaceSource,
    "xxx": XxxSource,  # new
}
```

Then users can use `--sources xxx`.

## 7. Caching

### Two-level Cache

1. **Item cache** (JSON): Each item's LLM result cached at `history/{source}/{date}/json/{cache_id}.json`. Same-day reruns skip LLM calls.

2. **Email cache** (HTML): Rendered email cached at `history/{source}/{date}/{source}_email.html`. Same-day reruns load directly.

## 8. Configuration Parameters

### Common Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| --sources | Source list | required |
| --provider | LLM provider | openai |
| --model | Model name | required |
| --base_url | API URL | None |
| --api_key | API key | None |
| --temperature | LLM temperature | 0.7 |
| --smtp_server | SMTP server | - |
| --smtp_port | SMTP port | - |
| --sender | Sender email | - |
| --receiver | Receiver(s), comma-sep | - |
| --sender_password | Email auth code | - |
| --description | Interest file | description.txt |
| --num_workers | Parallel workers | 4 |
| --save | Save history | False |

### GitHub Parameters (--gh_ prefix)

| Parameter | Description | Default |
|-----------|-------------|---------|
| --gh_languages | Language filter | all |
| --gh_since | Time range | daily |
| --gh_max_repos | Max repos | 30 |

### HuggingFace Parameters (--hf_ prefix)

| Parameter | Description | Default |
|-----------|-------------|---------|
| --hf_content_type | Content types | papers models |
| --hf_max_papers | Max papers | 30 |
| --hf_max_models | Max models | 15 |

### Twitter Parameters (--x_ prefix)

| Parameter | Description | Default |
|-----------|-------------|---------|
| --x_accounts_file | Accounts list file | x_accounts.txt |
| --x_rapidapi_key | RapidAPI key for twitter-api45 | required for Twitter |
| --x_rapidapi_host | RapidAPI host | twitter-api45.p.rapidapi.com |
| --x_discover_accounts | Enable profile-driven account discovery | False |
| --x_merge_static_accounts | Merge discovered accounts with x_accounts.txt | False |
| --x_use_persisted_accounts | Reuse a persisted discovered account pool | False |
| --x_skip_discovery_if_persisted | Skip fresh discovery when persisted pool exists | True |
| --x_discovery_persist_file | Persisted discovered account pool file | x_accounts.discovered.txt |
| --x_profile_file | Optional profile file for discovery | description.txt content |
| --x_profile_urls | Optional homepage / Scholar URLs for discovery | None |
| --x_discovery_rounds | Discovery rounds | 2 |
| --x_discovery_max_candidates | Max intermediate candidates | 20 |
| --x_discovery_max_final_accounts | Max selected discovered accounts | 10 |
| --x_discovery_search_results_per_query | RapidAPI results consumed per discovery query | 5 |
| --x_discovery_sample_tweets | Recent tweets sampled for candidate scoring | 2 |
| --x_discovery_min_score | Minimum fit score for auto-include | 6.0 |
| --x_since_hours | Lookback window | 24 |
| --x_max_tweets_per_user | Max timeline items per account | 20 |
| --x_max_tweets | Max final recommendations | 50 |
| --x_skip_retweets | Exclude retweets | True |
| --x_include_replies | Include replies | False |

## 9. Comparison with Previous Version

| Aspect | Old (2 separate projects) | New (unified framework) |
|--------|--------------------------|------------------------|
| Projects | 2 independent directories | 1 unified project |
| Code reuse | llm/, email duplicated | Shared llm/, base_source.py, email_utils/ |
| Running | Execute 2 scripts separately | Single command with --sources |
| Extensibility | Copy entire project for new source | Implement BaseSource + register |
| Config | Separate main_gpt.sh each | Unified config, source args with prefix |
| Cache | Separate *_history/ dirs | Unified history/{source}/{date}/ |
