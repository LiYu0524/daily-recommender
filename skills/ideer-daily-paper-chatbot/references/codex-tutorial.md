# Agent Tutorial

This note teaches Codex, InternShannon / 书安, or another coding agent how to use `ideer-daily-paper-chatbot` inside the iDeer repo.

## What this skill is for

Use this skill when you want:

- daily paper collection from iDeer-supported sources
- chatbot-written summaries, ranking, and grouping
- report and ideas generation without configuring the repo's own LLM API
- optional HTML artifacts for reading or email drafting

This skill keeps iDeer's source-fetching workflow, but moves the intelligence layer into the current Codex conversation.

## What this skill does not need

You do **not** need:

- `MODEL_NAME`
- `BASE_URL`
- `API_KEY`
- Ollama

You only need the repo, Python environment, and working fetchers.

## Install into InternShannon / 书安

From the iDeer repo root, run:

```bash
python3 skills/ideer-daily-paper-chatbot/scripts/install_internshannon_skill.py \
  --resign \
  --restart \
  --verify
```

This installs a materialized `ideer-daily-paper-chatbot.md` into:

- `~/.a3s/workspace/skills/`
- `/Applications/Intern Shannon.app/Contents/Resources/skills/` when the app exists

On InternShannon v0.2.1, the bundled app install path is the one that makes the skill visible in `/api/agent/skills`.

## Recommended workflow

### 1. Open the iDeer repo

Work in the repo root:

```bash
cd /path/to/iDeer
```

### 2. Make sure the repo can fetch papers

You usually want to inspect:

- `.env`
- `profiles/description.txt`
- `profiles/researcher_profile.md`

Typical user intent:

- choose sources such as `arxiv` and `huggingface`
- decide whether they want only a digest, or digest + report + ideas
- decide whether they want local files only, or a later email step

### 3. Ask the agent to run the chatbot-first workflow

Good prompt examples:

```text
Use ideer-daily-paper-chatbot to fetch today's papers from HF and arXiv, then organize them by Agent / Spatial Intelligence / World Model.
```

```text
Use ideer-daily-paper-chatbot to run a dry run for today's paper digest, save artifacts locally, and do not send email.
```

```text
Use ideer-daily-paper-chatbot to fetch raw papers, summarize them directly in chat, and write a report plus ideas under a test output directory.
```

### 4. What the agent should do

When this skill is used correctly, the agent should:

1. inspect `.env` and the profile files
2. fetch raw items with repo fetchers or browsing
3. avoid `main.py` for summarization/scoring
4. summarize and rank papers in the chat
5. save markdown/json artifacts
6. optionally render HTML using the bundled skill script

### 5. Generate HTML artifacts

If markdown/json artifacts already exist in one directory, use:

```bash
python skills/ideer-daily-paper-chatbot/scripts/render_chatbot_artifacts.py \
  --date YYYY-MM-DD \
  --base-dir <artifact-dir>
```

Example:

```bash
python skills/ideer-daily-paper-chatbot/scripts/render_chatbot_artifacts.py \
  --date 2026-04-13 \
  --base-dir chatbot_test_outputs/2026-04-13
```

This generates:

- `report.html`
- `digest_email.html`

inside the chosen artifact directory.

## Suggested prompt patterns

### A. Simple daily digest

```text
Use ideer-daily-paper-chatbot. Fetch today's Hugging Face and arXiv papers, then give me a short digest grouped by Agent / Spatial Intelligence / World Model and save it locally.
```

### B. Digest plus report

```text
Use ideer-daily-paper-chatbot. Fetch raw papers, write a cross-source report in Chinese, save markdown outputs, then render report.html and digest_email.html.
```

### C. Research idea generation

```text
Use ideer-daily-paper-chatbot. Based on today's papers and my researcher profile, generate 3 concrete research ideas and save them as JSON.
```

### D. Test-only run

```text
Use ideer-daily-paper-chatbot. Do a test run only, write everything under chatbot_test_outputs, and do not send any email.
```

## Recommended artifact layout

For safe local tests, use a dedicated output directory such as:

```text
chatbot_test_outputs/YYYY-MM-DD/
```

Typical files:

- `raw_candidates.json`
- `test_digest.md`
- `test_ideas.json`
- `report.html`
- `digest_email.html`

## If the user wants email later

This skill can still support email, but only after the content exists and SMTP is configured.

Recommended sequence:

1. first run a local dry run
2. inspect digest/report/ideas
3. render HTML
4. send only when the user explicitly asks

## Troubleshooting

### The repo fetches papers but `main.py` fails

That is expected when the repo's own LLM API config is missing. This skill should bypass that path and continue with chatbot-written summaries.

### HTML is missing

Run the bundled renderer from the skill:

```bash
python skills/ideer-daily-paper-chatbot/scripts/render_chatbot_artifacts.py \
  --date YYYY-MM-DD \
  --base-dir <artifact-dir>
```

### Chinese text looks garbled

Open the generated HTML files that include UTF-8 meta tags from the bundled renderer. If a browser still shows stale content, reopen the file instead of using an old cached tab.

## Short version

If you only remember one command pattern, remember this workflow:

1. ask Codex to use `ideer-daily-paper-chatbot`
2. fetch raw papers only
3. let Codex write digest/report/ideas
4. render HTML with the skill-local script
