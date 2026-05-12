# iDeer Daily Paper Chatbot Automation

Use this reference when creating a recurring automation for the chatbot-first workflow in Codex, InternShannon / 书安, or another agent runtime.

## Default schedule

- Time zone: `Asia/Shanghai`
- Time: `13:00`
- Frequency: every day
- InternShannon / 书安 v0.2.1 exposes a workflow `trigger-schedule` node with `cron_expression` and `timezone`.
- First installation validation should stay dry-run only; enable the recurring task only after local artifacts are correct.

Weekly form for Codex automation UIs:

```text
FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;BYHOUR=13;BYMINUTE=0
```

## Working directory

Use the user's local iDeer repo root.

## First-run setup before automation

If `.env` is missing, `SMTP_RECEIVER` is empty, or `profiles/description.txt` is missing/empty, run first-run setup before creating a recurring task. The agent should ask for receiver email, research direction, sources, and preferred delivery time, then call:

```bash
python3 skills/ideer-daily-paper-chatbot/scripts/setup_chatbot_config.py
```

Pass the collected answers as JSON on stdin.

Default chatbot-first sources are `arxiv semanticscholar huggingface rss`; RSS defaults to `https://imjuya.github.io/juya-ai-daily/rss.xml`.

The setup helper saves the schedule preference with `schedule_enabled=false`. Do not create a recurring task until a dry run has produced local artifacts and the user confirms automation.

## InternShannon / 书安 setup command

If the skill is not yet visible in the local InternShannon skill list, run this once from the iDeer repo root:

```bash
python3 skills/ideer-daily-paper-chatbot/scripts/install_internshannon_skill.py \
  --resign \
  --restart \
  --verify
```

## Recommended automation prompt

```text
Run the iDeer daily paper workflow in chatbot-first mode. Use .env, profiles/description.txt, and profiles/researcher_profile.md as the source of truth. Fetch raw items from the configured sources using the repo fetchers when possible, or browse the public source pages when necessary. Do not rely on the repo's own LLM API pipeline for summarization, scoring, reports, or ideas; perform those steps directly in the chatbot. Save markdown/report/ideas artifacts under history/, verify what was created, and only send email if SMTP configuration is complete and a live send is explicitly requested.
```

## InternShannon scheduled workflow evidence

On a local InternShannon v0.2.1 install, this API exposes the scheduled trigger node:

```bash
curl -fsS http://127.0.0.1:29653/api/workflows/node-types | python3 -m json.tool
```

Expected node:

```json
{
  "node_type": "trigger-schedule",
  "label": "定时触发",
  "default_data": {
    "cron_expression": "0 9 * * *",
    "timezone": "UTC",
    "mode": "cron",
    "frequency": "daily"
  }
}
```

For iDeer, set `cron_expression` to the desired daily schedule and `timezone` to `Asia/Shanghai`.

The first-run helper records the user's preferred time in `state/ideer_chatbot_setup.json` and `.web_config.json`, but it intentionally leaves `schedule_enabled` false.

## Minimum automation checks

- confirm `.env` exists
- confirm `SMTP_RECEIVER` exists
- confirm `profiles/description.txt`
- confirm `profiles/researcher_profile.md` when idea generation is enabled
- confirm source fetchers or public source pages are reachable
- confirm SMTP config only when live email is requested
