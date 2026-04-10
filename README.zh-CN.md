<div align="center">

# iDeer: 🦌 is all u need

**一只替你刷技术情报的赛博鹿**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![Claude Code Skill](https://img.shields.io/badge/Claude%20Code-Skill-purple.svg)](https://claude.ai/code)
[![Codex Skill](https://img.shields.io/badge/Codex-Skill-0A7A5E.svg)](./skills/ideer-daily-paper/SKILL.md)
[![AgentSkills Standard](https://img.shields.io/badge/AgentSkills-Standard-brightgreen.svg)](https://github.com/anthropics/agent-skills)

[English](./README.en.md) · [技术文档](./docs/TECHNICAL.md) · [桌面 Demo](./docs/DESKTOP_DEMO.md)

<img src="./docs/ideer.svg" alt="iDeer Icon" width="360" />

**每天花 30 分钟分别刷 GitHub、arXiv、HuggingFace、Twitter？**
**iDeer 把这件事压缩到打开邮箱的 5 分钟。**

</div>

---

iDeer 是一个**多源信息聚合 + 定时推送**工具。你告诉它你关注什么，它替你盯住散落在各个平台的更新，用Agent做筛选、打分、摘要，最后把值得看的内容在你设定的时间自动送到邮箱里。

核心价值只有一句话：**把「每天手动巡逻多个平台」的重复劳动，变成「打开邮件直接看结论」的被动接收。**

## 谁需要 iDeer

<table>
<tr>
<td width="33%">

### 🔬 AI 科研

每天 arXiv 上百篇新论文，哪些跟你的方向有关？

iDeer 按你的研究画像自动筛选、评分、生成摘要，还能**跨源关联 GitHub 新 repo 和 HuggingFace 新模型**，顺手长出 research ideas。

> *"早上打开邮件，今天值得精读的 3 篇论文已经帮我挑好了。"*

</td>
<td width="33%">

### 📊 金融研报 <sup>building</sup>

行业发生了什么？哪些公司有新动向？

iDeer 聚合多个信息源，**按时间段总结行业事件**，提供研报所需的基本素材和趋势概览。适合需要定期输出行业简报的分析师和研究员。

> *"周一早上收到上周行业速览，写周报的素材已经在那了。"*

</td>
<td width="33%">

### ⚖️ 法学 / 其他学科

关注的几本核心期刊又发了什么？学科顶会有什么新 paper？

iDeer 通过 Semantic Scholar 覆盖 **2 亿+ 跨学科论文**，定时推送你关注领域的最新发表，不用再逐个登录期刊网站翻目录。

> *"不漏掉任何一篇跟我课题相关的新文章，鹿帮我盯着。"*

</td>
</tr>
</table>

## 它能产出什么

| 产出                 | 说明                           | 示例路径                           |
| -------------------- | ------------------------------ | ---------------------------------- |
| **📰 日报**           | 每个源的精选推荐 + AI 摘要     | `history/<source>/<date>/`         |
| **📋 跨源简报**       | 打通多个源的个性化叙事报告     | `history/reports/<date>/report.md` |
| **💡 Research Ideas** | 从当天情报里自动长出的研究灵感 | `history/ideas/<date>/ideas.json`  |

不只是 RSS —— 它会**打分、排序、总结、跨源关联**，最后按你设定的频率（每天 / 仅工作日 / 每周 / 每月）把结果投喂到邮箱。

## 数据源

| 源                    | 覆盖范围                      | 你能配置的                     |
| --------------------- | ----------------------------- | ------------------------------ |
| **GitHub**            | Trending 仓库                 | 语言过滤、时间范围、最大数量   |
| **HuggingFace**       | 论文 + 模型                   | 内容类型、数量上限             |
| **arXiv**             | 每日新论文                    | 分类（cs.AI / cs.CL / ...）   |
| **Semantic Scholar**  | 2 亿+ 跨学科论文（WoS 替代）  | 搜索词、年份、领域、数量       |
| **X / Twitter**       | 技术讨论 + 行业动态           | 账号列表、自动发现、回溯窗口   |

> **插件化设计** —— 想加新源？继承 `BaseSource`，实现抽象方法，注册到 `SOURCE_REGISTRY`，完事。

## 快速开始

```bash
# 1. 环境
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

# 2. 最少配三项
# MODEL_NAME=    BASE_URL=    API_KEY=
vim .env

# 3. 写你的兴趣画像
vim profiles/description.txt

# 4. 跑一次试试（不发邮件）
python main.py --sources arxiv semanticscholar huggingface --save --skip_source_emails
```

搞定。去 `history/` 看产出。

## 完整日报机

想要定时自动跑 + 收邮件 + 生成报告和点子？

```bash
# .env 里补上：
SMTP_SERVER=xxx       # 邮件相关
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

# 一键流水线
bash scripts/run_daily.sh
```

默认模式已经是论文阅读优先：`arxiv + semanticscholar + huggingface`，并且会同时生成论文摘要、跨源 report 和 research ideas。

**两种定时方式：**

| 方式 | 适合 | 配置 |
|------|------|------|
| **Web UI 内置调度器** | 跑着 web server 的用户 | Admin 页面 → 定时推送，选频率和时间 |
| **系统 cron** | 服务器部署 | `0 13 * * * /path/to/scripts/run_daily.sh` |

支持四种推送频率：**每日 / 仅工作日 / 每周 / 每月**。

## 架构

```
你的兴趣画像 + Google Scholar（支持多个）
     ↓
┌─────────┐  ┌──────────────┐  ┌────────┐  ┌─────────────────┐  ┌───────────┐
│ GitHub  │  │ HuggingFace  │  │ arXiv  │  │ Semantic Scholar │  │ X/Twitter │
└────┬────┘  └──────┬───────┘  └───┬────┘  └────────┬────────┘  └─────┬─────┘
     │              │              │                 │                 │
     └──────────────┴──────────────┴────────┬────────┴─────────────────┘
                                            ↓
                                     LLM 评分 + 筛选
                                            ↓
                               ┌────────────┼────────────┐
                               ↓            ↓            ↓
                            📰 日报    📋 跨源简报   💡 Ideas
                               ↓            ↓            ↓
                                      📧 邮件投喂
                                            ↓
                              ┌─────────────────────────────┐
                              │  ⏰ 定时推送（支持仅工作日）  │
                              └─────────────────────────────┘
```

## 更多能力

- **🖥️ Web UI** — 内置 FastAPI 后端 + WebSocket 实时日志，浏览器里跑
- **⏰ 定时推送** — 每日 / 仅工作日 / 每周 / 每月，Admin 页面一键配置
- **🎓 多 Scholar 画像** — 同时关联多个 Google Scholar 账户，合并发表记录
- **🖥️ 桌面客户端** — 本地 GUI 体验（见 [Desktop Demo](./docs/DESKTOP_DEMO.md)）
- **🔌 Claude Code Skill** — 支持作为 Claude Code 技能集成
- **🤖 Codex Daily Paper Skill** — 内置 [`skills/ideer-daily-paper/SKILL.md`](./skills/ideer-daily-paper/SKILL.md)，让 Codex 按统一流程完成每日论文阅读、自动整理、邮件发送和自动化调度

## 用 Codex 做每日论文自动化

如果你希望把 iDeer 变成 Codex 的每日自动化任务，推荐把仓库里的 [`skills/ideer-daily-paper/SKILL.md`](./skills/ideer-daily-paper/SKILL.md) 作为操作规范。

典型流程是：

1. 先按 skill 的要求补齐 `.env`、`profiles/description.txt` 和可选的 `profiles/researcher_profile.md`
2. 先做一次 dry run，确认 `history/` 里已经产出日报、report 或 ideas
3. 再让 Codex automation 每天北京时间 13:00 定时调用 `bash scripts/run_daily.sh`

这个 skill 不是重新实现推荐逻辑，而是明确告诉 Codex 什么时候跑 `main.py`，什么时候跑 `scripts/run_daily.sh`，如何验证产物，以及什么时候可以安全发邮件

## FAQ

**Q：支持哪些 LLM？**
A：任何 OpenAI 兼容 API（含本地 Ollama）。配好 `MODEL_NAME` + `BASE_URL` + `API_KEY` 即可。

**Q：不想发邮件，只想本地看？**
A：加 `--skip_source_emails`，产出存在 `history/` 目录。

**Q：我的领域不是 AI，能用吗？**
A：能。Semantic Scholar 覆盖全学科，arXiv 支持自定义分类，兴趣描述用自然语言写你关注的方向就行。

**Q：能自定义评分逻辑吗？**
A：重写 `build_eval_prompt()` 和 `parse_eval_response()`，鹿随你调教。

---

<div align="center">

**如果这只鹿帮你省了时间，给它一颗 ⭐**

[![Star History Chart](https://api.star-history.com/svg?repos=LiYu0524/iDeer&type=Date)](https://star-history.com/#LiYu0524/iDeer&Date)

MIT License · Made by [@LiYu0524](https://github.com/LiYu0524)

</div>
