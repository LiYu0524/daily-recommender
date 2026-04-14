<div align="center">

# 爱鹿: iDeer is all you need

> 「这倒是提醒我了」

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

iDeer 是一个**多源信息聚合 + 定时推送**工具。你告诉它你关注什么，它替你盯住散落在各个平台的更新，用 LLM 做筛选、打分、摘要，最后把值得看的内容在你设定的时间自动送到邮箱里。

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

还在盯着三大刊和各种法C的微信公众号，一篇篇翻找跟自己课题相关的论文吗？

iDeer 通过 Semantic Scholar 覆盖 **2 亿+ 跨学科论文**，自动匹配你的研究方向，**第一时间整理最新论文和摘要推送到邮箱**。当别人还在一个个翻公众号的时候，你躺在床上打开邮件就已经超越了他们。

> *"早上醒来，跟我课题相关的新文章已经整理好了，鹿比我还勤快。"*

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
| **PubMed**            | 3600 万+ 生物医学文献         | 搜索词、天数范围、数量         |
| **Semantic Scholar**  | 2 亿+ 跨学科论文（WoS 替代）  | 搜索词、年份、领域、数量       |
| **X / Twitter**       | 技术讨论 + 行业动态           | 账号列表、自动发现、回溯窗口   |

> **插件化设计** —— 想加新源？继承 `BaseSource`，实现抽象方法，注册到 `SOURCE_REGISTRY`，完事。

## 快速开始

### 方式一：pip install（推荐）

```bash
pip install ideer

# 初始化工作目录（生成 .env 和 profiles 模板）
ideer init

# 配置 LLM（必填）
vim .env   # MODEL_NAME=gpt-4o-mini  BASE_URL=https://api.openai.com/v1  API_KEY=sk-xxx

# 跑一次试试
ideer run --sources arxiv huggingface --skip-source-emails
```

### 方式二：clone 仓库

```bash
git clone https://github.com/LiYu0524/iDeer && cd iDeer
pip install -r requirements-web.txt
cp .env.example .env
vim .env   # 填 MODEL_NAME, BASE_URL, API_KEY
vim profiles/description.txt

python main.py --sources arxiv semanticscholar huggingface --save --skip_source_emails
```

搞定。去 `history/` 看产出。

### 方式三：GitHub Actions 定时报告（无需服务器）

没有服务器、也不想自己配运行环境的话，可以直接用仓库自带的 GitHub Actions 工作流定时生成跨源报告，并把最终报告邮件发到你的邮箱。

详细教程：

- [从 fork 到每天自动收邮件的完整配置指南](./docs/github-actions-report-guide.md)

工作流文件：

- `.github/workflows/scheduled-report-email.yml`

默认行为：

- 在 GitHub Hosted Runner 上直接运行
- 只发送一封**跨源报告邮件**
- 不发送每个 source 的单独邮件
- 把 `history/reports/` 作为 artifact 保留下来，方便下载查看
- 默认源是 `github + arxiv + semanticscholar + huggingface`
- 默认定时是 `UTC 00:00`，对应**北京时间 08:00**

#### 必填 Secrets

| Secret | 用途 | 说明 |
|------|------|------|
| `IDEER_MODEL_NAME` | 模型名 | 例如 `gpt-4o-mini`、`Qwen/Qwen2.5-72B-Instruct` |
| `IDEER_BASE_URL` | 模型 API 地址 | 例如 `https://api.openai.com/v1` 或兼容 OpenAI 的网关 |
| `IDEER_API_KEY` | 模型 API Key | 用于 LLM 调用 |
| `IDEER_SMTP_SERVER` | SMTP 服务器 | 例如 `smtp.gmail.com` |
| `IDEER_SMTP_PORT` | SMTP 端口 | 常见是 `465` 或 `587` |
| `IDEER_SMTP_SENDER` | 发件邮箱 | 发送日报的邮箱 |
| `IDEER_SMTP_RECEIVER` | 收件邮箱 | 默认接收日报的邮箱 |
| `IDEER_SMTP_PASSWORD` | SMTP 密码 / 应用专用密码 | 邮箱授权密码 |
| `IDEER_DESCRIPTION_TEXT` | 你的兴趣描述 | 这是推荐和报告筛选的核心输入 |

#### 推荐填写的 Secrets

| Secret | 用途 | 默认值 / 示例 |
|------|------|------|
| `IDEER_PROVIDER` | LLM provider | 默认 `openai` |
| `IDEER_TEMPERATURE` | 采样温度 | 默认 `0.5` |
| `IDEER_DAILY_SOURCES` | 选择要跑哪些源 | 默认 `github arxiv semanticscholar huggingface` |
| `IDEER_REPORT_TITLE` | 邮件标题 | 默认 `Daily Personal Briefing` |
| `IDEER_RESEARCHER_PROFILE_TEXT` | 更完整的研究者画像 | 会用于报告生成 |
| `IDEER_NUM_WORKERS` | 并发 worker 数 | 默认 `6`，GitHub Actions 上不建议盲目调太高 |

#### 按数据源填写的可选 Secrets

| Secret | 何时需要 | 说明 |
|------|------|------|
| `IDEER_ARXIV_CATEGORIES` | 你启用了 arXiv 时 | 例如 `cs.AI cs.CL cs.LG` |
| `IDEER_ARXIV_MAX_ENTRIES` | 你启用了 arXiv 时 | 原始抓取数量上限 |
| `IDEER_ARXIV_MAX_PAPERS` | 你启用了 arXiv 时 | 最终推荐论文数量上限 |
| `IDEER_GH_LANGUAGES` | 你启用了 GitHub 时 | 例如 `python typescript` 或 `all` |
| `IDEER_GH_SINCE` | 你启用了 GitHub 时 | `daily` / `weekly` / `monthly` |
| `IDEER_GH_MAX_REPOS` | 你启用了 GitHub 时 | GitHub 候选仓库上限 |
| `IDEER_HF_CONTENT_TYPES` | 你启用了 HuggingFace 时 | 例如 `papers`、`papers models` |
| `IDEER_HF_MAX_PAPERS` | 你启用了 HuggingFace 时 | 论文数量上限 |
| `IDEER_HF_MAX_MODELS` | 你启用了 HuggingFace 时 | 模型数量上限 |
| `IDEER_SS_QUERIES` | 你启用了 Semantic Scholar 且想手动指定查询时 | 多个 query 用 `|` 分隔 |
| `IDEER_SS_MAX_RESULTS` | 你启用了 Semantic Scholar 时 | 抓取结果上限 |
| `IDEER_SS_MAX_PAPERS` | 你启用了 Semantic Scholar 时 | 最终推荐论文上限 |
| `IDEER_SS_YEAR` | 你启用了 Semantic Scholar 时 | 年份过滤 |
| `IDEER_SS_FIELDS_OF_STUDY` | 你启用了 Semantic Scholar 时 | 多个 field 用 `|` 分隔 |
| `IDEER_SS_API_KEY` | 你有 Semantic Scholar API key 时 | 可提高稳定性/额度 |
| `IDEER_X_RAPIDAPI_KEY` | 你启用了 X / Twitter 时 | X 数据源必须 |
| `IDEER_X_RAPIDAPI_HOST` | 你启用了 X / Twitter 时 | 默认 `twitter-api45.p.rapidapi.com` |
| `IDEER_X_ACCOUNTS` | 你启用了 X / Twitter 且想固定账号池时 | 多行或空格分隔都建议整理成文本 |
| `IDEER_X_DISCOVER_ACCOUNTS` | 你启用了 X / Twitter 且想自动发现账号时 | `1` 开启 |
| `IDEER_X_MERGE_STATIC_ACCOUNTS` | X 自动发现时 | 是否和静态账号池合并 |
| `IDEER_X_USE_PERSISTED_ACCOUNTS` | X 自动发现时 | 是否复用历史发现结果 |
| `IDEER_X_SKIP_DISCOVERY_IF_PERSISTED` | X 自动发现时 | 有持久化结果时跳过重新发现 |
| `IDEER_X_DISCOVERY_PERSIST_FILE` | X 自动发现时 | 默认 `state/x_accounts.discovered.txt` |

#### 怎么选数据源

- 通过 `IDEER_DAILY_SOURCES` 这个 Secret 选择
- 写成空格分隔，例如：
  - `github arxiv`
  - `github huggingface semanticscholar`
  - `arxiv semanticscholar huggingface twitter`
- 如果启用了某个源，但没填它必需的 API 配置，运行时会失败

#### 怎么用

1. Fork 仓库
2. 在 fork 仓库的 `Settings -> Secrets and variables -> Actions` 填好上面的 Secrets
3. 打开 `Actions -> Scheduled Report Email`
4. 点击 `Run workflow` 手动跑一次确认配置正确
5. 如果需要改定时，编辑 `.github/workflows/scheduled-report-email.yml` 里的 cron

#### 适合谁

- 只想定时收到报告邮件，不想自己配服务器
- 接受 GitHub Hosted Runner 的运行时长和并发限制
- 主要需求是“抓取 + 生成跨源报告 + 发邮件”，不是长期在线 Web 服务

### CLI 命令一览

```
ideer init                                     # 初始化工作目录
ideer run --sources arxiv huggingface          # 运行推荐管线
ideer run --sources arxiv --ideas --report     # 带 ideas + 跨源报告
ideer fetch arxiv --categories cs.AI --max 10  # 单独抓取，输出 JSON
ideer clean --dry-run                          # 预览缓存占用
ideer clean --before 2026-04-01               # 清理旧数据
ideer serve                                    # 启动 Web UI
```

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

## Bot 接入（Telegram / 飞书）

除了邮件和 Web UI，iDeer 也支持通过 Telegram / 飞书 Bot 触发任务并接收结果。

定位说明：当前 Bot 是**指令式交互**（Command-driven），不是自由聊天模式。

- 适合：一键触发 `/run`、`/report`、`/ideas` 这类操作
- 不适合：把 Bot 当成通用对话 Agent 长聊

### 支持的 Bot 命令

| 命令 | 说明 |
|------|------|
| `/help` | 查看可用命令 |
| `/status` | 查看当前模型配置、调度状态 |
| `/run <sources>` | 运行指定源，如 `/run arxiv github` |
| `/report` | 运行全部源并生成跨源报告 |
| `/ideas` | 运行全部源并生成研究想法 |

说明：

- `/run` 会保存并回传当次 source 结果（如 `arxiv_email.html`）
- `/report` 会优先回传跨源报告
- 长文本会自动切块发送，避免消息长度限制导致截断

### Telegram Bot 配置

**第一步：创建 Bot**

1. 在 Telegram 中搜索 [@BotFather](https://t.me/BotFather)，发送 `/newbot`
2. 按提示设置 Bot 名称，获得 Bot Token（格式如 `123456:ABC-DEF...`）
3. 可选：发送 `/setcommands` 设置命令菜单：
   ```
   help - 查看可用命令
   status - 查看配置状态
   run - 运行推荐管线
   report - 生成跨源报告
   ideas - 生成研究想法
   ```

**第二步：配置 iDeer**

在 `.env` 中添加：

```bash
BOT_TELEGRAM_ENABLED=1
BOT_TELEGRAM_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
BOT_TELEGRAM_WEBHOOK_SECRET=your-random-secret-string
```

`BOT_TELEGRAM_WEBHOOK_SECRET` 是你自定义的随机字符串，用于校验 Telegram 回调请求，建议 32 字节以上随机值（例如 `openssl rand -hex 32` 生成）。

**第三步：设置 Webhook**

启动 web server 后，用 curl 告诉 Telegram 你的 webhook 地址：

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-domain.com/bot/telegram/webhook",
    "secret_token": "your-random-secret-string"
  }'
```

建议再执行一次查询确认：

```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo"
```

> Telegram webhook 要求 HTTPS。如果你有公网域名 + 证书，直接用域名即可。如果是本地开发，参考下方「本地开发：用 ngrok 暴露 Webhook」章节。

**第四步：验证**

在 Telegram 中给你的 Bot 发送 `/help`，应收到命令列表。再发送 `/run arxiv`，应看到：

1. 进度消息
2. 任务完成提示
3. 结果附件或文本摘要

### 本地开发：用 ngrok 暴露 Webhook

Telegram 和飞书的 webhook 都要求公网 HTTPS 地址。本地开发时可以用 [ngrok](https://ngrok.com/) 把本机端口暴露到公网。

**安装 ngrok**

```bash
# macOS
brew install ngrok

# Linux (snap)
snap install ngrok

# 或直接下载：https://ngrok.com/download
```

首次使用需要注册并配置 authtoken：

```bash
ngrok config add-authtoken <YOUR_NGROK_AUTHTOKEN>
```

**启动隧道**

iDeer web server 默认端口是 `8090`，ngrok 必须指向同一端口：

```bash
# 先启动 iDeer web server
python web_server.py   # 默认监听 8090

# 另开一个终端，启动 ngrok
ngrok http 8090
```

ngrok 启动后会显示公网地址，类似：

```
Forwarding  https://xxxx-xxxx.ngrok-free.app -> http://localhost:8090
```

**用 ngrok 地址设置 Telegram Webhook**

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://xxxx-xxxx.ngrok-free.app/bot/telegram/webhook",
    "secret_token": "your-random-secret-string"
  }'
```

飞书同理，把事件订阅的请求地址设为 `https://xxxx-xxxx.ngrok-free.app/bot/feishu/webhook`。

> 注意：ngrok 免费版每次重启会分配新地址，需要重新设置 webhook。端口不匹配（如 ngrok 指向 80 但 server 跑在 8090）会导致 502 Bad Gateway。

### 飞书 Bot 配置

**第一步：创建飞书应用**

1. 登录 [飞书开放平台](https://open.feishu.cn/app)，创建企业自建应用
2. 在「凭证与基础信息」页获取 App ID 和 App Secret
3. 在「事件订阅」页面：
   - 设置请求地址为 `https://your-domain.com/bot/feishu/webhook`
   - 获取 Verification Token 和 Encrypt Key
   - 添加事件：`im.message.receive_v1`（接收消息）
4. 在「权限管理」中开通：`im:message`（获取与发送消息）、`im:resource`（上传文件）
5. 发布应用版本并等待审批通过

**第二步：配置 iDeer**

在 `.env` 中添加：

```bash
BOT_FEISHU_ENABLED=1
BOT_FEISHU_APP_ID=cli_xxxxxxxxxxxx
BOT_FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
BOT_FEISHU_VERIFICATION_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxx
BOT_FEISHU_ENCRYPT_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
```

**第三步：验证**

启动 web server，飞书开放平台会自动发送 challenge 验证请求。验证通过后，在飞书中给 Bot 发送 `/help` 即可。

### 通用配置项

以下配置项对两个平台通用，在 `.env` 中设置：

```bash
# 速率限制：每秒最多接受的请求数（默认 5）
# BOT_RATE_LIMIT_RPS=5

# 请求体大小限制（默认 1MB）
# BOT_MAX_BODY_BYTES=1048576

# 白名单：只允许指定 chat_id 使用 Bot（逗号分隔，留空则不限制）
# BOT_ALLOW_FROM=chat_id_1,chat_id_2
```

说明：

- `BOT_ALLOW_FROM` 为空时表示不限制
- Telegram 填 `chat_id`
- 飞书填对应会话 `chat_id`

### 健康检查

Bot 路由挂载后，可通过 `GET /bot/health` 检查状态：

```bash
curl https://your-domain.com/bot/health
# {"telegram_enabled": true, "feishu_enabled": false, "active_tasks": 0}
```

### 常见问题

**Q1：配置了 BOT_TELEGRAM_TOKEN 但 Bot 不回复？**

A：通常是 webhook 没有正确设置到 `/bot/telegram/webhook`，或地址不是公网 HTTPS。先用 `getWebhookInfo` 检查。

**Q2：为什么收到 `Pipeline completed` 但没有结果内容？**

A：请确认服务已重启到最新代码，并检查 `history/<source>/<date>/` 是否有 `*.html` / `*.md` 产物。Bot 会优先发送 HTML 附件，其次发送文本摘要。

**Q3：Bot 能不能自由聊天？**

A：当前实现是指令式模式，只处理 `/help`、`/status`、`/run`、`/report`、`/ideas` 等命令。

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
                               ├────── 📧 邮件投喂 ──────┤
                               ├── 🤖 Telegram Bot ──────┤
                               └── 🐦 飞书 Bot ──────────┘
                                            ↓
                              ┌─────────────────────────────┐
                              │  ⏰ 定时推送（支持仅工作日）  │
                              └─────────────────────────────┘
```

## 更多能力

- **🖥️ Web UI** — 内置 FastAPI 后端 + WebSocket 实时日志，浏览器里跑
- **⏰ 定时推送** — 每日 / 仅工作日 / 每周 / 每月，Admin 页面一键配置
- **🤖 Bot 接入** — Telegram / 飞书 Bot，发命令触发报告，Bot 直接返回结果
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

## 缓存管理

运行产生的缓存和历史数据存放在 `state/`（抓取/评分缓存）和 `history/`（产出文件）两个目录下。

```bash
# 查看缓存占用
python agent_bridge.py cache-clean --dry-run

# 清除所有缓存和历史
python agent_bridge.py cache-clean

# 只清除抓取缓存（保留评分和历史）
python agent_bridge.py cache-clean fetch

# 只清除 7 天前的旧数据
python agent_bridge.py cache-clean --before 2026-04-03

# 也可以通过 main.py 清除
python main.py --cache_clean              # 清除全部
python main.py --cache_clean fetch eval   # 只清除缓存，保留历史
```

可选目标：`all`（默认）、`fetch`、`eval`、`history`、`ideas`、`reports`

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

## 致谢

iDeer 的灵感和实现受益于以下优秀的开源项目：

| 项目 | 说明 |
|------|------|
| [daily-arXiv-ai-enhanced](https://github.com/dw-dengwei/daily-arXiv-ai-enhanced) | AI 驱动的 arXiv 日报生成，自动抓取、摘要、部署到 GitHub Pages |
| [customize-arxiv-daily](https://github.com/JoeLeelyf/customize-arxiv-daily) | 基于自定义兴趣描述的 arXiv 论文推荐 |
| [ArxivDigest](https://github.com/AutoLLM/ArxivDigest) | 基于自然语言研究兴趣的 arXiv 每日摘要 |
| [zotero-arxiv-daily](https://github.com/TideDra/zotero-arxiv-daily) | 结合 Zotero 文献库上下文的 arXiv 论文发现 |
| [cv-arxiv-daily](https://github.com/Vincentqyw/cv-arxiv-daily) | 计算机视觉方向的 arXiv 每日自动更新 |

感谢这些项目为学术信息自动化领域做出的贡献。

## 关于 Star

通过 Claude Code / Codex 运行 iDeer 的 Skill（`/ideer-daily-paper`、`/idea-from-daily`）时，会自动检查你是否已给本仓库点 Star，并在未 Star 时提示你完成。这不是强制要求，但如果 iDeer 帮到了你，一颗 Star 是对开源作者最好的支持。iDeer才会赢！

---

## 社区交流

欢迎进群讨论、反馈问题、交流用法，也欢迎直接提 PR 一起把 iDeer 做得更好。

<div align="center">
  <img src="./docs/ideer-wechat-group.jpg" alt="iDeer 微信交流群二维码" width="360" />
</div>

---

<div align="center">

**如果这只鹿帮你省了时间，给它一颗 ⭐**

[![Star History Chart](https://api.star-history.com/svg?repos=LiYu0524/iDeer&type=Date)](https://star-history.com/#LiYu0524/iDeer&Date)

MIT License · Made by [@LiYu0524](https://github.com/LiYu0524)

</div>
