# iDeer Daily Paper Chatbot Presets

Use these presets when the user wants the iDeer daily-paper experience without requiring the repo to call its own LLM API.

## `paper-only-chat`

Use when the user only wants today's paper digest in chat plus saved markdown.

```env
DAILY_SOURCES="arxiv semanticscholar huggingface"
HF_CONTENT_TYPES="papers"
GENERATE_REPORT=0
SEND_REPORT_EMAIL=0
GENERATE_IDEAS=0
```

Recommended behavior:

- fetch raw items with repo fetchers or the web
- summarize and rank in the chatbot
- save markdown under `history/`

## `paper-report-chat`

Use when the user wants the digest plus a chatbot-written cross-source report.

```env
DAILY_SOURCES="arxiv semanticscholar huggingface"
HF_CONTENT_TYPES="papers"
GENERATE_REPORT=1
SEND_REPORT_EMAIL=0
GENERATE_IDEAS=0
```

Recommended behavior:

- fetch raw items
- have the chatbot write the report
- save `history/reports/<date>/report.md`

## `paper-ideas-chat`

Use when the user wants the digest plus chatbot-generated research ideas.

```env
DAILY_SOURCES="arxiv semanticscholar huggingface"
HF_CONTENT_TYPES="papers"
GENERATE_REPORT=1
SEND_REPORT_EMAIL=0
GENERATE_IDEAS=1
RESEARCHER_PROFILE=profiles/researcher_profile.md
```

Recommended behavior:

- fetch raw items
- have the chatbot write both report and ideas
- save report markdown and `ideas.json`

## `paper-email-chat`

Use when the user wants chatbot-written content but still wants email delivery.

```env
DAILY_SOURCES="arxiv semanticscholar huggingface"
HF_CONTENT_TYPES="papers"
GENERATE_REPORT=1
SEND_REPORT_EMAIL=1
GENERATE_IDEAS=0
```

Also requires SMTP settings in `.env`.

Recommended behavior:

- fetch raw items
- have the chatbot write digest/report
- send only if SMTP config is complete and the user explicitly requested a live send

## Source selection heuristics

- Prefer `arxiv + semanticscholar` for literature coverage
- Keep `huggingface` when the user cares about paper ecosystem speed
- Add `github` for implementation-following workflows
- Add `twitter` only when the user explicitly values discourse and credentials exist
