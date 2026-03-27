# AGENTS

## Local Python Environment

- Created on: `2026-03-21 17:49:52 CST`
- Project root: `/Users/shaoshuai3/Desktop/code/daily-recommender`
- Virtual environment: `/Users/shaoshuai3/Desktop/code/daily-recommender/.venv`
- Python version in env: `Python 3.13.12`

## Setup Commands

Create the environment:

```bash
cd /Users/shaoshuai3/Desktop/code/daily-recommender
python3 -m venv .venv
```

Install project dependencies:

```bash
.venv/bin/pip install -r requirements.txt
```

Activate the environment in a shell:

```bash
cd /Users/shaoshuai3/Desktop/code/daily-recommender
source .venv/bin/activate
```

## Installed Requirements

Installed from `requirements.txt`:

- `tqdm`
- `loguru`
- `requests`
- `beautifulsoup4`
- `ollama`
- `openai`

## Verification

Basic CLI import/argument parsing was verified with:

```bash
.venv/bin/python main.py --help
```

This command completed successfully after the environment was created and dependencies were installed.

## Run Prerequisites

- Full project runs primarily use the standard LLM trio in `.env`: `MODEL_NAME`, `BASE_URL`, and `API_KEY`.
- `PROVIDER` defaults to `openai`-compatible usage.
- Legacy `LLM_*` variables are still accepted as fallbacks for compatibility, but they are no longer the primary path.
- Full project runs also require SMTP settings because the current main flow sends email directly.
- Source fetching and LLM evaluation require network access to external services.
- The current Twitter/X integration uses RapidAPI (`twitter-api45`) rather than direct X API or Nitter.
- Twitter/X also supports profile-driven account discovery via `--x_discover_accounts`; discovery inputs can be configured with `X_PROFILE_FILE`, `X_PROFILE_URLS`, and `X_DISCOVERY_*` in `.env`.
- Discovered account pools can be persisted to `x_accounts.discovered.txt` (or `X_DISCOVERY_PERSIST_FILE`) and later reused with `X_USE_PERSISTED_ACCOUNTS=1`.

## Notes

- `main_gpt.sh` is now repo-relative and reads runtime settings from `.env` instead of embedding credentials directly.
- `main.py` now auto-loads `.env` from the project root. Twitter/X RapidAPI credentials can be supplied there via `X_RAPIDAPI_KEY` and `X_RAPIDAPI_HOST`.
- `main.py` now prefers `MODEL_NAME`, `BASE_URL`, `API_KEY`, `PROVIDER`, and `TEMPERATURE`; legacy `LLM_*` variables remain supported as fallbacks.
