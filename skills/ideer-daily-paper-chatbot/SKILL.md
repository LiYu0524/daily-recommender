---
name: ideer-daily-paper-chatbot
description: "Use iDeer as a daily paper-reading workflow for chatbot-first users such as Codex, Gemini, or ChatGPT. Keep the original iDeer paper-digest setup, source selection, history validation, email/report/ideas workflow, but replace in-repo LLM API summarization and scoring with the current chatbot session. 适用于不用单独配置 OpenAI/SiliconFlow/Ollama API key 的每日论文整理、报告、想法生成与自动化。"
allowed-tools: "read(*), write(.env), write(.web_config.json), write(.client_config.json), write(profiles/**), write(state/**), write(history/**), write(chatbot_test_outputs/**), grep(*), glob(*), bash(*), web_fetch(*), web_search(*)"
---

# iDeer Daily Paper Chatbot

Use this skill when the user wants the iDeer daily-paper workflow but does not want the repo to call its own LLM API. The chatbot should do the reading, scoring, grouping, report writing, and idea generation directly in the current conversation.

## Constants

- `PROJECT_DIR`: the current iDeer repository root. When installed by `scripts/install_internshannon_skill.py`, this becomes the absolute clone path.
- `SKILL_DIR`: `skills/ideer-daily-paper-chatbot` inside the iDeer repository.
- Default sources: `arxiv semanticscholar huggingface rss`
- Default RSS feed: `https://imjuya.github.io/juya-ai-daily/rss.xml`
- First-run schedule preference: `Asia/Shanghai` daily at `13:00`, saved but not enabled.
- First validation mode: dry run only, save local artifacts, do not send email, do not enable recurring schedules.

## Core rule

Keep as much of the original iDeer workflow as possible:

- reuse the repo layout
- reuse the source fetchers when they work
- reuse `.env`, `profiles/description.txt`, and `profiles/researcher_profile.md`
- reuse `history/` as the artifact destination when saving outputs

But do **not** rely on `main.py` for any step that requires `MODEL_NAME`, `BASE_URL`, `API_KEY`, or Ollama. Instead, fetch raw items and have the chatbot perform the intelligence layer.

Never use the Tinder/swipe product path for this skill. Do not call `/api/swipe`, read `client/src/swipeView.tsx` for workflow state, or use saved swipe queues as recommendation input.

## What stays the same

- source defaults and source-selection heuristics
- profile-driven filtering using `profiles/description.txt`
- optional stronger report/ideas guidance from `profiles/researcher_profile.md`
- artifact validation in `history/`
- optional SMTP sending when the user explicitly wants live email and SMTP config exists
- Codex automation support for recurring runs

## What changes

Replace these original in-repo LLM tasks with chatbot work in-session:

- per-item Chinese summary
- per-item relevance scoring
- per-source daily summary
- cross-source narrative report
- research idea generation

Do not call `python main.py` or `bash scripts/run_daily.sh` unless the user explicitly wants to test the original API-based pipeline. For chatbot-first runs, fetch raw data with the repo's fetchers or with web browsing and continue in the conversation.

## Files to inspect first

Always check:

- `.env`
- `profiles/description.txt`

Check when needed:

- `profiles/researcher_profile.md`
- `profiles/x_accounts.txt`

If `.env` does not exist, or if `.env` lacks `SMTP_RECEIVER`, or if `profiles/description.txt` is missing/empty, enter **First-run setup** before any digest run.

## Modes

Map the user request to one of these modes:

- **First-run setup**: ask the user for required setup fields, write `.env`/profiles/UI config with the helper script, then run a small dry run
- **Chatbot dry run**: fetch sources, summarize in-chat, save markdown/html/json artifacts, do not send email
- **Chatbot full digest**: fetch sources, summarize in-chat, save artifacts, send email only if SMTP config is complete and the user asked for live send
- **Setup/fix**: adjust `.env`, profiles, categories, or fetchers so source collection works
- **Recurring automation**: create or update a Codex automation that performs a chatbot-first digest

## First-run setup

Use this mode when the user is installing iDeer for the first time or when the config files are missing. If the client supports option boxes or structured follow-up questions, use them; otherwise ask concise numbered questions.

### Required questions

Ask for:

- receiver email address
- research direction / interest description
- information sources
- preferred delivery time

Use these defaults when the user accepts defaults or gives an incomplete answer:

- sources: `arxiv semanticscholar huggingface rss`
- schedule: `daily`, `13:00`, `Asia/Shanghai`
- arXiv categories: `cs.AI cs.CL cs.LG`
- Hugging Face content type: `papers`
- Semantic Scholar field: `Computer Science`
- report: enabled
- ideas: disabled
- email sending: disabled
- recurring schedule: disabled

### Optional questions

Ask, but allow the user to skip:

- Google Scholar or personal homepage URL
- SMTP server, sender, and app password
- whether to include GitHub
- whether to generate research ideas

Only include `twitter` if the user explicitly chooses it and an `X_RAPIDAPI_KEY` is available. Do not ask for repo LLM API keys during chatbot-first setup.

### Write setup files

After collecting answers, pass JSON to the helper:

```bash
cat <<'JSON' | .venv/bin/python skills/ideer-daily-paper-chatbot/scripts/setup_chatbot_config.py
{
  "receiver": "user@example.com",
  "description": "User research interests here",
  "scholar_urls": [],
  "sources": ["arxiv", "semanticscholar", "huggingface", "rss"],
  "schedule": {
    "frequency": "daily",
    "time": "13:00",
    "timezone": "Asia/Shanghai"
  },
  "generate_ideas": false
}
JSON
```

If `.venv` does not exist yet, use `python3 skills/ideer-daily-paper-chatbot/scripts/setup_chatbot_config.py` for this setup step. The helper writes `.env`, `profiles/description.txt`, optional `profiles/researcher_profile.md`, `state/ideer_chatbot_setup.json`, `.web_config.json`, and `.client_config.json`.

The helper must not invent SMTP passwords or API keys. If SMTP is incomplete, report that email is not configured and that the first run will only save local artifacts.

After setup, run a small chatbot-first dry run, such as `arxiv` and `huggingface` with low limits, then report the files created and that scheduling remains disabled.

## Source defaults

- Default paper/news sources: `arxiv semanticscholar huggingface rss`
- RSS defaults to Juya AI Daily: `https://imjuya.github.io/juya-ai-daily/rss.xml`
- Add `github` only when the user wants code/repo signals
- Add `twitter` only when the user explicitly wants social signals and credentials exist
- For Hugging Face, default to papers only
- For CS users, start arXiv from `cs.AI cs.CL cs.LG`; expand to `cs.CV cs.RO` for embodied, spatial, or robotics interests
- Prefer explicit Semantic Scholar queries when the profile is broad

## Chatbot-first pipeline

### Step 1: Classify and configure

If first-run setup is needed, complete it before this step.

Read the profile and decide:

- which sources to fetch
- whether report and idea generation are requested
- whether email is requested
- whether the request is one-off or recurring

Use `skills/ideer-daily-paper-chatbot/references/presets.md` for presets.

### Step 2: Fetch raw items

Prefer the repo fetchers first when the repo is available:

- `fetchers/arxiv_fetcher.py`
- `fetchers/huggingface_fetcher.py`
- `fetchers/semanticscholar_fetcher.py`
- `fetchers/rss_fetcher.py`
- `fetchers/github_fetcher.py`
- `fetchers/twitter_fetcher.py`

If the repo is not available or a fetcher is broken, use browsing and cite the public source pages.

Fetch raw candidates only. Do not call the repo's LLM scoring path.

Run commands from `PROJECT_DIR`. Prefer `.venv/bin/python`; if the virtualenv is missing, use Python 3.10+ to create it before fetching:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

### Step 3: Deduplicate and curate

The chatbot should:

- remove duplicates across sources when the same paper appears in HF and arXiv
- score relevance qualitatively or numerically in the conversation
- organize results by the user's stated interest directions
- write concise Chinese summaries and recommendation reasons

When the user gave explicit directions such as `Agent / Spatial Intelligence / World Model`, preserve those headings in the final digest.

### Step 4: Save artifacts in iDeer-compatible places

Prefer these output shapes:

- `history/<source>/<date>/<date>.md` for source-level markdown digests
- `history/reports/<date>/report.md` for cross-source report
- `history/ideas/<date>/ideas.json` for structured idea output
- optional `history/<source>/<date>/<source>_email.html` if you render an HTML email body

It is acceptable for chatbot-first runs to write fewer files than the original pipeline, as long as you report exactly what was written.

If the user wants HTML artifacts without touching the main repo scripts, use the bundled renderer:

```bash
.venv/bin/python skills/ideer-daily-paper-chatbot/scripts/render_chatbot_artifacts.py \
  --date YYYY-MM-DD \
  --base-dir <artifact-dir>
```

This script should render `report.html` and `digest_email.html` from chatbot-written markdown/json outputs inside the chosen artifact directory.

### Step 5: Email behavior

If SMTP is incomplete, do not claim that email was sent. Save the digest locally and tell the user what is missing.

If SMTP is complete and the user explicitly asked for sending, either:

- reuse the repo's email templates/utilities if convenient, or
- render a simple HTML body and send it through SMTP

Never send email on the first validation run unless the user clearly asked for a live send.

### Step 6: Recurring automation

For chatbot-first automation, prefer the native agent/workflow scheduler when available. Use the repo root as the working directory and write the prompt so the chatbot fetches raw source items, performs summarization itself, saves artifacts, and only sends email if SMTP exists.

First-run setup saves the user's schedule preference but does not enable it. Create or enable a recurring task only after the user confirms the dry-run artifacts look correct.

See `skills/ideer-daily-paper-chatbot/references/automation.md`.

## Safe command patterns

Use small fetch/test commands instead of the full original pipeline.

Examples:

```bash
.venv/bin/python - <<'PY'
from fetchers.huggingface_fetcher import get_daily_papers
print(len(get_daily_papers(10)))
PY
```

```bash
.venv/bin/python - <<'PY'
from fetchers.arxiv_fetcher import fetch_papers_for_categories
print(fetch_papers_for_categories(['cs.AI','cs.LG'], max_entries=25, sleep_range=(0,0)).keys())
PY
```

Use `bash scripts/run_daily.sh` only to debug the legacy API-based path.

## Validation checklist

After each run, report:

- the date that actually ran
- whether first-run setup was needed and which config files were written
- which sources were fetched
- whether summarization was done by the chatbot or by the repo pipeline
- which files were created
- whether email was sent, skipped, or blocked
- whether recurring scheduling is enabled or still only saved as a preference
- the first concrete blocker if anything failed

## Safety rules

- Never print API keys, SMTP passwords, or tokens
- Never claim files exist before checking them
- Never claim email was sent before checking SMTP success
- Do not overwrite user-authored profile files unless the user asked
- Prefer writing additive chatbot-first artifacts over changing core repo code unless a fetcher is actually broken

## Good default

For users who want paper digestion without API keys, start with:

- raw fetch from `arxiv` and `huggingface`
- chatbot-written markdown digest
- optional chatbot-written cross-source report
- no live email on the first pass
