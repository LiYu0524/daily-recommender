# InternShannon / 书安 Skill Validation

Date: 2026-05-10

This record validates the `ideer-daily-paper-chatbot` skill against the local InternShannon / 书安 v0.2.1 desktop app and the iDeer checkout at `/Users/liyu/Documents/daily-recommender`.

## App and skill installation

Verified app metadata:

```bash
plutil -p "/Applications/Intern Shannon.app/Contents/Info.plist"
```

Observed:

- `CFBundleDisplayName`: `书安`
- `CFBundleIdentifier`: `com.a3s.internshannon`
- `CFBundleShortVersionString`: `0.2.1`

Installed and verified the skill:

```bash
python3 skills/ideer-daily-paper-chatbot/scripts/install_internshannon_skill.py --resign --restart --verify
```

Observed:

```text
Installed workspace skill: /Users/liyu/.a3s/workspace/skills/ideer-daily-paper-chatbot.md
Installed bundled skill: /Applications/Intern Shannon.app/Contents/Resources/skills/ideer-daily-paper-chatbot.md
Updated bundled manifest: /Applications/Intern Shannon.app/Contents/Resources/skills/managed-skills.json
InternShannon skill API contains ideer-daily-paper-chatbot: True
```

The materialized skill points to the current repo:

```text
PROJECT_DIR: /Users/liyu/Documents/daily-recommender
SKILL_DIR: /Users/liyu/Documents/daily-recommender/skills/ideer-daily-paper-chatbot
```

## Skill discovery through the local app API

Command:

```bash
curl -fsS --max-time 3 http://127.0.0.1:29653/api/agent/skills
```

Observed entry:

```json
{
  "id": "ideer-daily-paper-chatbot",
  "name": "ideer-daily-paper-chatbot",
  "description": "Use iDeer as a daily paper-reading workflow for chatbot-first users such as Codex, Gemini, or ChatGPT..."
}
```

Result: the local InternShannon skill registry can see the iDeer skill.

## macOS app checks

Command:

```bash
codesign --verify --deep --strict --verbose=2 "/Applications/Intern Shannon.app"
```

Observed:

```text
/Applications/Intern Shannon.app: valid on disk
/Applications/Intern Shannon.app: satisfies its Designated Requirement
```

Command:

```bash
spctl --assess --type execute --verbose=4 "/Applications/Intern Shannon.app"
```

Observed:

```text
/Applications/Intern Shannon.app: rejected
```

Interpretation: local ad-hoc signing verifies after skill injection, but the app is not accepted by Gatekeeper assessment on this machine. This is a distribution/notarization trust check, not a skill-discovery failure.

## Fetcher dry run

Commands:

```bash
.venv/bin/python -m pipeline.agent_bridge fetch arxiv --categories cs.AI cs.CL cs.LG --max 3
.venv/bin/python -m pipeline.agent_bridge fetch huggingface --content_type papers --max 5
```

Observed:

- arXiv returned 9 raw items.
- Hugging Face returned 5 raw paper items.
- No `python main.py` call was used.
- No repo LLM API path was used for summarization or scoring.
- No Tinder/swipe endpoint or client queue was touched.
- No email was sent.

Local dry-run files:

```text
chatbot_test_outputs/2026-05-10/raw_arxiv.json
chatbot_test_outputs/2026-05-10/raw_huggingface.json
chatbot_test_outputs/2026-05-10/test_digest.md
chatbot_test_outputs/2026-05-10/test_ideas.json
chatbot_test_outputs/2026-05-10/report.html
chatbot_test_outputs/2026-05-10/digest_email.html
history/reports/2026-05-10/report.md
history/ideas/2026-05-10/ideas.json
```

`history/` and `chatbot_test_outputs/` are intentionally git-ignored runtime artifacts, so they remain local verification outputs rather than committed fixtures.

## HTML rendering check

Command:

```bash
.venv/bin/python skills/ideer-daily-paper-chatbot/scripts/render_chatbot_artifacts.py \
  --date 2026-05-10 \
  --base-dir chatbot_test_outputs/2026-05-10
```

Observed:

```text
/Users/liyu/Documents/daily-recommender/chatbot_test_outputs/2026-05-10/report.html
/Users/liyu/Documents/daily-recommender/chatbot_test_outputs/2026-05-10/digest_email.html
```

## Scheduled task support

InternShannon v0.2.1 exposes workflow APIs on `127.0.0.1:29653`.

Command:

```bash
curl -fsS --max-time 5 http://127.0.0.1:29653/api/workflows/node-types | python3 -m json.tool
```

Observed node:

```json
{
  "node_type": "trigger-schedule",
  "label": "定时触发",
  "category": "触发器",
  "description": "按 cron 表达式定时触发工作流（如每天 9:00）。",
  "executable": true,
  "default_data": {
    "cron_expression": "0 9 * * *",
    "timezone": "UTC",
    "mode": "cron",
    "frequency": "daily"
  }
}
```

Command:

```bash
curl -fsS --max-time 5 "http://127.0.0.1:29653/api/workflows/capabilities?command=workflow.run"
```

Observed endpoints include:

- `POST /api/workflows/validate`
- `POST /api/workflows/test`
- `POST /api/workflows/run`
- `GET /api/executions/:id/state`
- `GET /api/executions/:id/context`

Result: the app supports schedule-triggered workflows through `trigger-schedule`. This validation did not create or enable a recurring iDeer task; first-run verification stayed dry-run only.

