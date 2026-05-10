# iDeer Daily Paper Chatbot Automation

Use this reference when creating a recurring automation for the chatbot-first workflow in Codex, InternShannon / 书安, or another agent runtime.

## Default schedule

- Time zone: `Asia/Shanghai`
- Time: `13:00`
- Frequency: every day

Weekly form for Codex automation UIs:

```text
FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;BYHOUR=13;BYMINUTE=0
```

## Working directory

Use the user's local iDeer repo root.

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

## Minimum automation checks

- confirm `.env` exists
- confirm `profiles/description.txt`
- confirm `profiles/researcher_profile.md` when idea generation is enabled
- confirm source fetchers or public source pages are reachable
- confirm SMTP config only when live email is requested
