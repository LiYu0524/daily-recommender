# Daily Recommender

> English documentation: **[README.md](./README.md)**  
> 如果你希望查看默认英文版，请跳转到 **[README.md](./README.md)**。

一个面向个人的多源信息推荐与简报系统。

它会从 GitHub、HuggingFace、X / Twitter 等来源抓取内容，使用你配置的 OpenAI-compatible LLM 做筛选、摘要和排序，然后生成：

- 单源日报
- 跨平台连续阅读版报告
- 基于当日信号的 research ideas

## What It Does

这个仓库适合两类使用方式：

1. `个人日报引擎`
   每天从多个平台抓取高信号内容，生成 source 级日报并发送邮件。

2. `个人情报工作流`
   根据 profile 监控特定圈层账号、合并多源信息、输出连续可读报告，并在后半部分给出判断、预测和想法。

## Supported Sources

| Source | Data | Notes |
| --- | --- | --- |
| GitHub | Trending repositories | 适合追踪开源工具、框架、工程热点 |
| HuggingFace | Daily papers + popular models | 适合追踪论文和模型生态 |
| X / Twitter | Account timelines via RapidAPI | 支持静态账号池和 profile-driven discovery |

## Project Layout

```text
daily-recommender/
├── main.py                  # CLI entry
├── main_gpt.sh              # Repo-local launcher script
├── config.py                # Shared config dataclasses
├── base_source.py           # Shared source pipeline
├── report_generator.py      # Cross-source narrative report
├── idea_generator.py        # Research idea generation
├── description.txt          # Simple interest profile
├── researcher_profile.md    # Richer profile for reports / ideas
├── sources/                 # GitHub / HuggingFace / Twitter sources
├── fetchers/                # Raw data fetch clients
├── email_utils/             # HTML templates
├── llm/                     # OpenAI-compatible + Ollama wrappers
└── history/                 # Generated daily outputs
```

## Quick Start

### 1. 创建环境

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. 创建 `.env`

```bash
cp .env.example .env
```

最小必填的 LLM 配置是标准三件套：

```env
PROVIDER=openai
MODEL_NAME=your-model-name
BASE_URL=https://your-openai-compatible-endpoint/v1
API_KEY=your_api_key
TEMPERATURE=0.5
```

### 3. 跑默认流水线

```bash
bash main_gpt.sh
```

## Configuration Guide

项目会自动读取仓库根目录下的 `.env`。推荐把运行配置都放在这里，而不是写死在脚本中。

### 1. LLM

主路径是标准三件套：

```env
PROVIDER=openai
MODEL_NAME=gemini-3-flash-preview
BASE_URL=http://your-endpoint/v1
API_KEY=your_api_key
TEMPERATURE=0.5
```

说明：

- `PROVIDER` 一般填 `openai`
- `BASE_URL` 必须是 OpenAI-compatible endpoint
- `MODEL_NAME` 直接填写模型名
- `API_KEY` 是服务商密钥
- 老的 `LLM_*` 变量仍兼容，但只是 fallback

### 2. Email

如果你要跑完整主流程并发邮件，SMTP 必填：

```env
SMTP_SERVER=smtp.example.com
SMTP_PORT=465
SMTP_SENDER=you@example.com
SMTP_RECEIVER=you@example.com
SMTP_PASSWORD=your_smtp_password
```

说明：

- `SMTP_RECEIVER` 支持多个邮箱，逗号分隔
- `465` 默认走 SSL

### 3. X / Twitter

X 当前通过 RapidAPI `twitter-api45` 获取数据：

```env
X_RAPIDAPI_KEY=your_rapidapi_key
X_RAPIDAPI_HOST=twitter-api45.p.rapidapi.com
X_ACCOUNTS_FILE=x_accounts.txt
```

如果想让系统根据 profile 自动发现监控账号，还可以打开：

```env
X_DISCOVER_ACCOUNTS=1
X_PROFILE_FILE=
X_PROFILE_URLS=
X_DISCOVERY_PERSIST_FILE=x_accounts.discovered.txt
```

### 4. Optional Defaults

```env
DAILY_SOURCES="github huggingface"
NUM_WORKERS=8
DESCRIPTION_FILE=description.txt

GH_LANGUAGES="all"
GH_SINCE=daily
GH_MAX_REPOS=30

HF_CONTENT_TYPES="papers models"
HF_MAX_PAPERS=30
HF_MAX_MODELS=15

GENERATE_REPORT=0
GENERATE_IDEAS=0
```

## Common Commands

### 只跑一个 source

```bash
.venv/bin/python main.py --sources github --save
.venv/bin/python main.py --sources huggingface --save
.venv/bin/python main.py --sources twitter --save
```

### 同时跑多个 source

```bash
.venv/bin/python main.py --sources github huggingface twitter --save
```

### 生成跨平台连续阅读版报告

```bash
.venv/bin/python main.py \
  --sources github huggingface twitter \
  --save \
  --generate_report
```

### 生成 research ideas

```bash
.venv/bin/python main.py \
  --sources github huggingface twitter \
  --save \
  --generate_ideas \
  --researcher_profile researcher_profile.md
```

## Outputs

所有产物默认写入 `history/`：

```text
history/
├── github/<date>/
├── huggingface/<date>/
├── twitter/<date>/
├── reports/<date>/
└── ideas/<date>/
```

每个 source 通常包含：

- `json/`：单条缓存
- `<date>.md`：Markdown 日报
- `*_email.html`：HTML 邮件版本

报告目录包含：

- `report.json`
- `report.md`
- `report.html`

## Profile Files

### `description.txt`

轻量兴趣描述，适合 source 级筛选和摘要。

### `researcher_profile.md`

更适合 `--generate_report` 和 `--generate_ideas` 的 richer profile。

### `x_accounts.txt`

静态监控账号池。

### `x_accounts.discovered.txt`

动态发现后落盘的扩展账号池。默认已加入 `.gitignore`，不会提交。

## Sanity Check

如果你只想先验证标准 LLM 三件套是否通，可以直接跑：

```bash
.venv/bin/python - <<'PY'
from main import load_dotenv, env_first
from llm.GPT import GPT

load_dotenv()
model = env_first(("MODEL_NAME", "LLM_MODEL"))
base_url = env_first(("BASE_URL", "LLM_BASE_URL"))
api_key = env_first(("API_KEY", "LLM_API_KEY"))

client = GPT(model, base_url, api_key)
print(client.inference("Reply with exactly OK.", temperature=0))
PY
```

如果返回 `OK` 或 `OK.`，说明标准 endpoint 链路已经打通。

## Current Boundaries

- 主流程会直接发邮件，所以没有 SMTP 配置时不适合直接跑完整 `main.py`
- X 依赖 RapidAPI 的稳定性
- GitHub / HuggingFace / Twitter 先生成 source 级日报，再可选合成为统一 report
- 仓库已经移除了 `codex_bridge`，现在只保留标准模型配置链路
