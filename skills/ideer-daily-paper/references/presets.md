# iDeer Daily Paper Presets

Use these presets when Codex needs to choose a starting configuration without enough user detail.

## `paper-only`

Use when the user only wants a saved digest and does not want outbound email yet.

```env
DAILY_SOURCES="arxiv semanticscholar huggingface"
HF_CONTENT_TYPES="papers"
GENERATE_REPORT=0
SEND_REPORT_EMAIL=0
GENERATE_IDEAS=0
```

Recommended run:

```bash
python main.py --sources arxiv semanticscholar huggingface --save --skip_source_emails
```

## `paper-email`

Use when the user wants a paper digest emailed every day.

```env
DAILY_SOURCES="arxiv semanticscholar huggingface"
HF_CONTENT_TYPES="papers"
GENERATE_REPORT=1
SEND_REPORT_EMAIL=1
GENERATE_IDEAS=0
```

Also requires SMTP settings in `.env`.
Email delivery should go through the repo's SMTP/code path only.

Recommended run:

```bash
bash scripts/run_daily.sh
```

## `paper-plus-ideas`

Use when the user also wants research idea generation from the daily reading.

This is the repo default.

```env
DAILY_SOURCES="arxiv semanticscholar huggingface"
HF_CONTENT_TYPES="papers"
GENERATE_REPORT=1
SEND_REPORT_EMAIL=1
GENERATE_IDEAS=1
RESEARCHER_PROFILE=profiles/researcher_profile.md
```

Also requires:

- a valid `profiles/researcher_profile.md`
- SMTP settings in `.env`

Email delivery should go through the repo's SMTP/code path only.

Recommended run:

```bash
bash scripts/run_daily.sh
```

## `paper-plus-code`

Use when the user wants papers and implementation signals together.

```env
DAILY_SOURCES="arxiv semanticscholar huggingface github"
HF_CONTENT_TYPES="papers"
GENERATE_REPORT=1
SEND_REPORT_EMAIL=1
GENERATE_IDEAS=0
```

## Source selection heuristics

- Prefer `arxiv + semanticscholar` for literature coverage.
- Keep `huggingface` when the user cares about model or paper ecosystem velocity.
- Add `github` when the user wants codebases worth cloning.
- Add `twitter` only for users who explicitly value social discussion, conference chatter, or creator discovery.

## Artifact checklist

After a successful run, expect some combination of:

- `history/arxiv/<date>/`
- `history/semanticscholar/<date>/`
- `history/huggingface/<date>/`
- `history/github/<date>/`
- `history/twitter/<date>/`
- `history/reports/<date>/report.md`
- `history/ideas/<date>/ideas.json`

## Delivery constraint

- Do not use Apple Mail, Outlook, Mail.app, or any other personal mail client as a fallback sender.
