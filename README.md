# Daily Recommender

一个面向个人的信息推荐与简报系统。

它会从多个来源抓取内容，使用你配置的 OpenAI-compatible LLM 做筛选、摘要和排序，然后生成日报并发送邮件。目前支持：

- GitHub Trending
- HuggingFace Daily Papers / 热门 Models
- X / Twitter（通过 RapidAPI `twitter-api45`）

项目还支持两类更高层产物：

- 跨平台连续阅读版报告
- 基于当日信号生成 research ideas

## 1. 环境准备

推荐使用仓库内虚拟环境：

```bash
cd /Users/shaoshuai3/Desktop/code/daily-recommender
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 2. 配置方式

项目会自动读取仓库根目录下的 `.env`。

推荐配置方式是标准三件套：

- `MODEL_NAME`
- `BASE_URL`
- `API_KEY`

`.env.example` 是模板。实际使用时：

```bash
cp .env.example .env
```

然后填写。

### 2.1 LLM 配置

最小可用配置：

```env
PROVIDER=openai
MODEL_NAME=your-model-name
BASE_URL=https://your-openai-compatible-endpoint/v1
API_KEY=your_api_key
TEMPERATURE=0.5
```

说明：

- `PROVIDER` 默认按 OpenAI-compatible 客户端调用，通常填 `openai`
- `BASE_URL` 必须带上 `/v1`
- `MODEL_NAME` 直接填模型名
- `API_KEY` 为服务商提供的 key
- 老的 `LLM_*` 变量仍兼容，但不再是主路径

### 2.2 邮件配置

`main.py` 的主流程会直接发邮件，所以如果你要真正跑完整日报，SMTP 也必须配置：

```env
SMTP_SERVER=smtp.example.com
SMTP_PORT=465
SMTP_SENDER=you@example.com
SMTP_RECEIVER=you@example.com
SMTP_PASSWORD=your_smtp_password
```

说明：

- `SMTP_RECEIVER` 支持多个邮箱，逗号分隔
- `465` 走 SSL，其他端口按 SMTP + STARTTLS 处理

### 2.3 X / Twitter 配置

X 目前走 RapidAPI，而不是官方 X API，也不是 Nitter。

最小配置：

```env
X_RAPIDAPI_KEY=your_rapidapi_key
X_RAPIDAPI_HOST=twitter-api45.p.rapidapi.com
X_ACCOUNTS_FILE=x_accounts.txt
```

如果你要启用自动发现账号池，还可以配置：

```env
X_DISCOVER_ACCOUNTS=1
X_PROFILE_FILE=
X_PROFILE_URLS=
X_DISCOVERY_PERSIST_FILE=x_accounts.discovered.txt
```

### 2.4 可选默认参数

`.env` 里还可以放这些运行默认值：

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
```

## 3. 如何运行

### 3.1 用脚本跑默认日报

```bash
cd /Users/shaoshuai3/Desktop/code/daily-recommender
bash main_gpt.sh
```

这个脚本会：

- 自动加载 `.env`
- 使用 `.venv/bin/python`
- 使用 `.env` 里的 source 默认值
- 保存结果到 `history/`

### 3.2 直接跑指定 source

只跑 GitHub：

```bash
.venv/bin/python main.py --sources github --save
```

只跑 HuggingFace：

```bash
.venv/bin/python main.py --sources huggingface --save
```

只跑 X：

```bash
.venv/bin/python main.py --sources twitter --save
```

同时跑多源：

```bash
.venv/bin/python main.py --sources github huggingface twitter --save
```

## 4. 生成更高层产物

### 4.1 生成跨平台连续阅读版报告

```bash
.venv/bin/python main.py \
  --sources github huggingface twitter \
  --save \
  --generate_report
```

相关可选参数：

- `--report_profile`
- `--report_title`
- `--report_min_score`
- `--report_max_items`
- `--report_theme_count`
- `--report_prediction_count`
- `--report_idea_count`
- `--send_report_email`

报告会落盘到：

```text
history/reports/<date>/
  report.json
  report.md
  report.html
```

### 4.2 生成 research ideas

```bash
.venv/bin/python main.py \
  --sources github huggingface twitter \
  --save \
  --generate_ideas \
  --researcher_profile researcher_profile.md
```

ideas 会落盘到：

```text
history/ideas/<date>/
  ideas.json
  ideas.md
  ideas_email.html
```

## 5. 配置文件说明

### `description.txt`

这是推荐系统的兴趣描述输入。各 source 的单条打分和摘要都会参考它。

### `researcher_profile.md`

这是 report / idea generation 更适合使用的 richer profile。

如果存在：

- `--generate_report` 默认优先读它
- `--generate_ideas` 会直接使用它

### `x_accounts.txt`

这是静态监控账号池。

### `x_accounts.discovered.txt`

这是 discovery 跑完后落盘的扩展账号池，后续可以复用。

## 6. 输出目录

默认保存在 `history/`：

```text
history/
  github/<date>/
  huggingface/<date>/
  twitter/<date>/
  reports/<date>/
  ideas/<date>/
```

每个 source 通常包含：

- `json/`：单条缓存
- `<date>.md`：Markdown 日报
- `*_email.html`：HTML 邮件版本

## 7. 最小调通检查

如果你只想先验证 LLM 三件套是否通，可以直接跑：

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

如果返回 `OK`，说明三件套链路已经通了。

## 8. 当前实现边界

- 主流程会直接发邮件，所以没有 SMTP 配置时不适合直接跑完整 `main.py`
- X 依赖 RapidAPI 的稳定性
- GitHub / HuggingFace / Twitter 的日报先按 source 生成，再可选合成为统一 report
- 当前仓库已经移除了 `codex_bridge`，不再支持通过 Codex 认证方式调用 LLM
