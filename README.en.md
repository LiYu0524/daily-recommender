<div align="center">

# iDeer: 🦌 is all u need

> "That reminds me."

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![Claude Code Skill](https://img.shields.io/badge/Claude%20Code-Skill-purple.svg)](https://claude.ai/code)
[![Codex Skill](https://img.shields.io/badge/Codex-Skill-0A7A5E.svg)](./skills/ideer-daily-paper/SKILL.md)
[![AgentSkills Standard](https://img.shields.io/badge/AgentSkills-Standard-brightgreen.svg)](https://github.com/anthropics/agent-skills)

[简体中文](./README.md) · [Tech Docs](./docs/TECHNICAL.md) · [Desktop Demo](./docs/DESKTOP_DEMO.md)

<img src="./docs/ideer.svg" alt="iDeer Icon" width="360" />

**Spending 30 minutes every day checking GitHub, arXiv, HuggingFace, Twitter, and journal feeds?**  
**iDeer compresses that into a 5-minute email review.**

</div>

---

iDeer is a **multi-source intelligence aggregator with scheduled delivery**. You describe what you care about, and it watches scattered sources for you, filters and scores them with an LLM, writes summaries, and delivers the items worth reading at the time you choose.

Its core value is simple: **turn repetitive manual patrol across multiple platforms into passive intake through one digest email.**

## Who Needs iDeer

<table>
<tr>
<td width="33%">

### 🔬 AI Research

Hundreds of new papers land on arXiv every day. Which ones are actually relevant to your work?

iDeer filters and ranks them against your research profile, writes summaries, and can even **connect papers with new GitHub repos and HuggingFace models**, then grow them into research ideas.

> *"By the time I open my inbox, the three papers worth reading today are already selected."*

</td>
<td width="33%">

### 📊 Financial Research <sup>building</sup>

What changed in the industry? Which companies moved? What belongs in the weekly brief?

iDeer aggregates signals across sources and **summarizes notable developments over a time window**, giving analysts a ready-made base layer for recurring industry reports.

> *"Monday's industry snapshot is already in my mailbox before I start writing."*

</td>
<td width="33%">

### ⚖️ Law and Other Disciplines

What did the journals in your field publish? Which conference papers matter this week?

iDeer uses Semantic Scholar to cover **200M+ papers across disciplines**, so you do not need to log into individual journal sites and skim tables of contents one by one.

> *"I stop missing papers related to my topic because the deer is watching for me."*

</td>
</tr>
</table>

## What It Produces

| Output | Description | Example Path |
| --- | --- | --- |
| **📰 Daily digests** | Curated picks plus AI summaries for each source | `history/<source>/<date>/` |
| **📋 Cross-source report** | A personalized narrative briefing across all sources | `history/reports/<date>/report.md` |
| **💡 Research ideas** | Research directions grown automatically from the day's signals | `history/ideas/<date>/ideas.json` |

This is more than RSS. iDeer **scores, ranks, summarizes, and connects signals across sources**, then sends the result on your schedule: daily, weekdays, weekly, or monthly.

## Data Sources

| Source | Coverage | Configurable Controls |
| --- | --- | --- |
| **GitHub** | Trending repositories | language filter, time window, max items |
| **HuggingFace** | Papers and models | content type, per-type limits |
| **arXiv** | Daily new papers | categories such as `cs.AI`, `cs.CL`, `cs.CV` |
| **Semantic Scholar** | 200M+ academic papers | queries, year, field, result limit |
| **X / Twitter** | Technical discussion and industry chatter | account list, discovery, lookback window |

> **Plugin-style architecture**: add a new source by extending `BaseSource`, implementing the abstract methods, and registering it in `SOURCE_REGISTRY`.

## Quick Start

```bash
# 1. Environment
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

# 2. Fill the minimum three LLM settings
# MODEL_NAME=    BASE_URL=    API_KEY=
vim .env

# 3. Write your interest profile
vim profiles/description.txt

# 4. Run a first dry run without sending emails
python main.py --sources arxiv semanticscholar huggingface --save --skip_source_emails
```

Then inspect `history/`.

## Full Daily Pipeline

Want scheduled runs, email delivery, a cross-source report, and idea generation?

```bash
# Add these to .env:
SMTP_SERVER=xxx
SMTP_PORT=465
SMTP_SENDER=xxx
SMTP_RECEIVER=xxx
SMTP_PASSWORD=xxx
DAILY_SOURCES="arxiv semanticscholar huggingface"
HF_CONTENT_TYPES="papers"
GENERATE_REPORT=1
SEND_REPORT_EMAIL=1
GENERATE_IDEAS=1
RESEARCHER_PROFILE=profiles/researcher_profile.md

# One-command pipeline
bash scripts/run_daily.sh
```

The default mode is already **paper-first**: `arxiv + semanticscholar + huggingface`, with paper summaries, a cross-source report, and research ideas enabled by default.

**Two scheduling options:**

| Method | Best For | Setup |
| --- | --- | --- |
| **Built-in Web UI scheduler** | Users already running the web server | Admin page → scheduled delivery |
| **System cron** | Server deployments | `0 13 * * * /path/to/scripts/run_daily.sh` |

Supported frequencies: **daily, weekdays, weekly, monthly**.

## Architecture

```text
Your interest profile + Google Scholar (multiple profiles supported)
     ↓
┌─────────┐  ┌──────────────┐  ┌────────┐  ┌─────────────────┐  ┌───────────┐
│ GitHub  │  │ HuggingFace  │  │ arXiv  │  │ Semantic Scholar │  │ X/Twitter │
└────┬────┘  └──────┬───────┘  └───┬────┘  └────────┬────────┘  └─────┬─────┘
     │              │              │                 │                 │
     └──────────────┴──────────────┴────────┬────────┴─────────────────┘
                                            ↓
                                     LLM scoring + filtering
                                            ↓
                               ┌────────────┼────────────┐
                               ↓            ↓            ↓
                            Digests       Report        Ideas
                               ↓            ↓            ↓
                                      Email delivery
                                            ↓
                               Scheduled automation
```

## More Capabilities

- **🖥️ Web UI**: FastAPI backend plus WebSocket live logs in the browser.
- **⏰ Scheduled delivery**: daily, weekdays, weekly, or monthly from the Admin page.
- **🎓 Multi-Scholar profile support**: merge publications from multiple Google Scholar accounts.
- **🖥️ Desktop client**: local GUI workflow. See [Desktop Demo](./docs/DESKTOP_DEMO.md).
- **🔌 Claude Code Skill**: use iDeer as a Claude Code skill.
- **🤖 Codex Daily Paper Skill**: use [skills/ideer-daily-paper/SKILL.md](./skills/ideer-daily-paper/SKILL.md) to teach Codex how to run daily paper reading, summarization, email delivery, and automation setup in a consistent way.

## Using Codex for Daily Paper Automation

If you want iDeer to become a recurring Codex task, use [skills/ideer-daily-paper/SKILL.md](./skills/ideer-daily-paper/SKILL.md) as the operating contract.

Typical flow:

1. Fill in `.env`, `profiles/description.txt`, and optionally `profiles/researcher_profile.md`.
2. Run one dry run and verify that digests, reports, or ideas were written to `history/`.
3. Let Codex automation call `bash scripts/run_daily.sh` every day at **13:00 Asia/Shanghai**.

This skill does not re-implement the recommender. It tells Codex when to run `main.py`, when to run `scripts/run_daily.sh`, how to verify outputs, and when email delivery is safe.

## FAQ

**Q: Which LLMs are supported?**  
A: Any OpenAI-compatible API, including local Ollama. Configure `MODEL_NAME`, `BASE_URL`, and `API_KEY`.

**Q: What if I do not want email and only want local artifacts?**  
A: Add `--skip_source_emails`. This skips source emails and idea emails, while still writing HTML/Markdown/JSON outputs to `history/`.

**Q: My field is not AI. Can I still use it?**  
A: Yes. Semantic Scholar covers broad academic domains, arXiv categories are configurable, and your interest description can be written in natural language for any field.

**Q: Can I customize the scoring logic?**  
A: Yes. Override `build_eval_prompt()` and `parse_eval_response()`.

---

## Acknowledgements

iDeer is inspired by and built upon ideas from these excellent open-source projects:

| Project | Description |
|---------|-------------|
| [daily-arXiv-ai-enhanced](https://github.com/dw-dengwei/daily-arXiv-ai-enhanced) | AI-powered daily arXiv crawler with summaries and GitHub Pages deployment |
| [customize-arxiv-daily](https://github.com/JoeLeelyf/customize-arxiv-daily) | Personalized arXiv paper recommendations based on custom interest descriptions |
| [ArxivDigest](https://github.com/AutoLLM/ArxivDigest) | Daily arXiv digest driven by natural-language research interests |
| [zotero-arxiv-daily](https://github.com/TideDra/zotero-arxiv-daily) | arXiv paper discovery informed by your Zotero library context |
| [cv-arxiv-daily](https://github.com/Vincentqyw/cv-arxiv-daily) | Automated daily updates for Computer Vision arXiv papers |

Thanks to these projects for their contributions to academic information automation.

---

<div align="center">

**If this deer saves you time, give it a star**

[![Star History Chart](https://api.star-history.com/svg?repos=LiYu0524/iDeer&type=Date)](https://star-history.com/#LiYu0524/iDeer&Date)

MIT License · Made by [@LiYu0524](https://github.com/LiYu0524)

</div>
