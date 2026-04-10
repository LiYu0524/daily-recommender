# iDeer Daily Paper Automation

Use this reference when Codex needs to create or update a recurring automation for this repo.

## Default schedule

- Time zone: `Asia/Shanghai`
- Time: `13:00`
- Frequency: every day

For Codex cron automations that only support weekly schedules, express this as all seven weekdays:

```text
FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;BYHOUR=13;BYMINUTE=0
```

## Working directory

```text
/Users/liyu/iDeer
```

## Recommended automation prompt

```text
Run the iDeer daily paper digest in the repo root. Use .env as the source of truth. Prefer bash scripts/run_daily.sh. The default digest should use paper-first sources: arxiv, semanticscholar, and huggingface. Email delivery must use the repo's SMTP/code path only; never use a desktop mail client or personal mail account as fallback. If required LLM, profile, or SMTP configuration is missing, report the missing items clearly and stop before claiming success. After the run, verify today's history artifacts for each source plus report.md/report.html and ideas.json/ideas_email.html, then summarize what was produced and what emails were sent.
```

## Minimum automation checks

- confirm `.env` exists
- confirm `MODEL_NAME`, `BASE_URL`, and `API_KEY`
- confirm `SMTP_SERVER`, `SMTP_PORT`, `SMTP_SENDER`, `SMTP_RECEIVER`, `SMTP_PASSWORD`
- confirm `profiles/description.txt`
- confirm `profiles/researcher_profile.md` when `GENERATE_IDEAS=1`
