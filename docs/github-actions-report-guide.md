# GitHub Actions 定时报告完整指南

这份指南面向没有服务器、也不想自己配 Python 运行环境的用户。

目标很简单：

- fork 仓库
- 配好 GitHub Actions Secrets
- 手动跑通一次
- 之后每天自动生成报告并发邮件

对应工作流文件：

- `.github/workflows/scheduled-report-email.yml`

这个工作流当前默认行为是：

- 在 GitHub Hosted Runner 上运行
- 只发送一封跨源汇总报告邮件
- 不发送每个 source 的单独邮件
- 默认源是 `github arxiv semanticscholar huggingface`
- 默认时间是 `UTC 00:00`，也就是北京时间 `08:00`
- 会把 `history/reports/` 和运行日志上传成 artifact

## 1. Fork 仓库

1. 打开 iDeer 仓库主页。
2. 点击右上角 `Fork`。
3. 选择你自己的 GitHub 账号。
4. 保持默认选项，完成 fork。

完成后，你会得到自己的仓库副本，例如：

- `https://github.com/<your-name>/iDeer`

后续所有 GitHub Actions 配置，都在你自己的 fork 仓库里做。

## 2. 启用 GitHub Actions

第一次 fork 后，GitHub 有时会默认禁用 workflow。

你需要在自己的 fork 仓库里：

1. 打开 `Actions` 标签页。
2. 如果看到 `I understand my workflows, go ahead and enable them` 之类的按钮，先点开。
3. 确认仓库的 Actions 已经启用。

如果 Actions 没启用，后面的定时任务不会运行。

## 3. 打开要用的工作流

仓库里已经带好了工作流：

- `Scheduled Report Email`

路径是：

- `.github/workflows/scheduled-report-email.yml`

你可以在自己的 fork 仓库中这样找到它：

1. 打开 `Actions`
2. 左侧找到 `Scheduled Report Email`

## 4. 先理解你必须准备什么

这条工作流至少需要两类外部能力：

- 一个可用的 LLM API
- 一个可用的 SMTP 发信邮箱

也就是说，GitHub Actions 虽然省掉了服务器和 Python 环境，但不会替你提供：

- 大模型 API Key
- 邮箱 SMTP 账号

所以你至少要先准备：

- 一个兼容 OpenAI API 的模型服务
- 一个能通过 SMTP 发邮件的邮箱

## 5. 在 fork 仓库里配置 Secrets

进入路径：

1. 打开你自己的 fork 仓库
2. `Settings`
3. 左侧 `Secrets and variables`
4. `Actions`
5. 点击 `New repository secret`

下面这些 Secrets 是最重要的。

### 5.1 必填 Secrets

| Secret | 说明 | 示例 |
|------|------|------|
| `IDEER_MODEL_NAME` | 模型名 | `gpt-4o-mini` |
| `IDEER_BASE_URL` | 模型 API 地址 | `https://api.openai.com/v1` |
| `IDEER_API_KEY` | 模型 API Key | 你的模型服务密钥 |
| `IDEER_SMTP_SERVER` | SMTP 服务器 | `smtp.gmail.com` |
| `IDEER_SMTP_PORT` | SMTP 端口 | `465` |
| `IDEER_SMTP_SENDER` | 发件邮箱 | `yourbot@gmail.com` |
| `IDEER_SMTP_RECEIVER` | 收件邮箱 | `yourname@example.com` |
| `IDEER_SMTP_PASSWORD` | SMTP 密码或应用专用密码 | 邮箱后台生成 |
| `IDEER_DESCRIPTION_TEXT` | 你的研究兴趣描述 | 见下方示例 |

`IDEER_DESCRIPTION_TEXT` 示例：

```text
I care about LLM agents, AI infra, open-source model releases, evaluation, safety, and developer tools.
```

### 5.2 推荐填写的 Secrets

| Secret | 是否推荐 | 默认值 | 用途 |
|------|------|------|------|
| `IDEER_PROVIDER` | 推荐 | `openai` | API provider 名称 |
| `IDEER_TEMPERATURE` | 推荐 | `0.5` | 采样温度 |
| `IDEER_DAILY_SOURCES` | 推荐 | `github arxiv semanticscholar huggingface` | 选择跑哪些源 |
| `IDEER_REPORT_TITLE` | 推荐 | `Daily Personal Briefing` | 报告邮件标题 |
| `IDEER_RESEARCHER_PROFILE_TEXT` | 可选但推荐 | 空 | 更长的研究者画像 |
| `IDEER_NUM_WORKERS` | 可选 | `6` | 并发 worker 数 |

### 5.3 按数据源填写的可选 Secrets

如果你启用了某个源，就只需要配它相关的 Secret。

| Secret | 何时需要 |
|------|------|
| `IDEER_ARXIV_CATEGORIES` | 你启用了 `arxiv` |
| `IDEER_ARXIV_MAX_ENTRIES` | 你启用了 `arxiv` |
| `IDEER_ARXIV_MAX_PAPERS` | 你启用了 `arxiv` |
| `IDEER_GH_LANGUAGES` | 你启用了 `github` |
| `IDEER_GH_SINCE` | 你启用了 `github` |
| `IDEER_GH_MAX_REPOS` | 你启用了 `github` |
| `IDEER_HF_CONTENT_TYPES` | 你启用了 `huggingface` |
| `IDEER_HF_MAX_PAPERS` | 你启用了 `huggingface` |
| `IDEER_HF_MAX_MODELS` | 你启用了 `huggingface` |
| `IDEER_SS_QUERIES` | 你启用了 `semanticscholar` 并想手工指定 query |
| `IDEER_SS_MAX_RESULTS` | 你启用了 `semanticscholar` |
| `IDEER_SS_MAX_PAPERS` | 你启用了 `semanticscholar` |
| `IDEER_SS_YEAR` | 你启用了 `semanticscholar` |
| `IDEER_SS_FIELDS_OF_STUDY` | 你启用了 `semanticscholar` |
| `IDEER_SS_API_KEY` | 你有 Semantic Scholar API Key |
| `IDEER_X_RAPIDAPI_KEY` | 你启用了 `twitter` |
| `IDEER_X_RAPIDAPI_HOST` | 你启用了 `twitter` |
| `IDEER_X_ACCOUNTS` | 你启用了 `twitter` 且想固定账号池 |
| `IDEER_X_DISCOVER_ACCOUNTS` | 你启用了 `twitter` 且想自动发现账号 |
| `IDEER_X_MERGE_STATIC_ACCOUNTS` | 你启用了 `twitter` 且同时使用静态账号和自动发现 |
| `IDEER_X_USE_PERSISTED_ACCOUNTS` | 你启用了 `twitter` 且想复用历史发现结果 |
| `IDEER_X_SKIP_DISCOVERY_IF_PERSISTED` | 你启用了 `twitter` 且已有持久化账号 |
| `IDEER_X_DISCOVERY_PERSIST_FILE` | 你启用了 `twitter` 且要自定义持久化文件路径 |

## 6. 怎么选择数据源

通过 `IDEER_DAILY_SOURCES` 这个 Secret 配置，格式是空格分隔。

示例：

```text
github arxiv semanticscholar huggingface
```

其他常见组合：

```text
github arxiv
```

```text
github huggingface semanticscholar
```

```text
arxiv semanticscholar huggingface twitter
```

注意：

- 你写了哪个源，运行时就会尝试跑哪个源
- 如果某个源缺必需配置，workflow 会失败
- `twitter` 源不是默认源，启用它通常还需要额外 API

## 7. 一个最小可运行配置

如果你想先最小成本跑通，建议先只用这 4 个默认源：

```text
github arxiv semanticscholar huggingface
```

最低只需要这些 Secrets：

```text
IDEER_MODEL_NAME
IDEER_BASE_URL
IDEER_API_KEY
IDEER_SMTP_SERVER
IDEER_SMTP_PORT
IDEER_SMTP_SENDER
IDEER_SMTP_RECEIVER
IDEER_SMTP_PASSWORD
IDEER_DESCRIPTION_TEXT
```

再加一个推荐项：

```text
IDEER_DAILY_SOURCES=github arxiv semanticscholar huggingface
```

## 8. 第一次手动运行

不要一上来就等定时任务。先手动跑一次，把配置问题一次看清。

步骤：

1. 打开 `Actions`
2. 进入 `Scheduled Report Email`
3. 点击右侧 `Run workflow`
4. 保持默认分支是你 fork 的 `main`
5. 可选地手动填：
   - `sources`
   - `report_title`
   - `receiver`
   - `send_email`
6. 点击确认运行

建议第一次这样填：

- `sources`: 留空，走 `IDEER_DAILY_SOURCES`
- `report_title`: 留空
- `receiver`: 留空
- `send_email`: `true`

这样更接近后续每天自动跑的真实行为。

## 9. 如何判断运行成功

运行成功后，你应该看到：

- GitHub Actions job 变成绿色
- 收件邮箱收到一封跨源报告邮件
- 当前 workflow 页面下方出现 artifact

artifact 里通常会包含：

- `report-run.log`
- `history/reports/...`
- 各 source 的 `history/...` 输出

如果邮件没收到，先去看 artifact 里的 `report-run.log`。

## 10. 如何修改每天运行时间

时间在工作流文件里：

- `.github/workflows/scheduled-report-email.yml`

默认是：

```yaml
schedule:
  - cron: "0 0 * * *"
```

这表示每天 `UTC 00:00`，也就是北京时间 `08:00`。

如果你想改成北京时间每天 `09:30`，对应 UTC 是 `01:30`，可以改成：

```yaml
schedule:
  - cron: "30 1 * * *"
```

修改后：

1. 提交到你 fork 的默认分支
2. GitHub 会自动按新的 cron 生效

## 11. 常见问题

### 11.1 为什么 workflow 没自动跑

常见原因：

- 你的 fork 仓库 Actions 没启用
- 默认分支不是 workflow 所在分支
- cron 刚改完，GitHub 还没到下一次调度窗口
- 仓库长时间没有活动，GitHub 对 schedule 有时会暂停

建议先手动 `Run workflow` 验证。

### 11.2 为什么报缺少 Secret

仓库里有一个预处理脚本会在运行前检查关键 Secrets。

如果缺：

- `IDEER_MODEL_NAME`
- `IDEER_BASE_URL`
- `IDEER_API_KEY`
- `IDEER_SMTP_SERVER`
- `IDEER_SMTP_PORT`
- `IDEER_SMTP_SENDER`
- `IDEER_SMTP_RECEIVER`
- `IDEER_SMTP_PASSWORD`
- `IDEER_DESCRIPTION_TEXT`

workflow 会直接失败，这是故意的。这样比“带着半残配置继续跑”更安全。

### 11.3 为什么没收到邮件

优先检查：

- `IDEER_SMTP_SENDER` 是否真的能发信
- `IDEER_SMTP_PASSWORD` 是否是正确的 SMTP 密码或应用专用密码
- `IDEER_SMTP_PORT` 和 `IDEER_SMTP_SERVER` 是否匹配
- 是否被邮箱服务商拦截或进入垃圾箱

### 11.4 为什么某个数据源报错

先看你有没有启用这个源，再看它的必需配置有没有填。

例如：

- 启用 `twitter` 但没填 `IDEER_X_RAPIDAPI_KEY`
- 启用 `semanticscholar` 的某些高级配置但 query 不合法

最稳的做法是：

1. 先只跑默认 4 源
2. 跑通后再逐个加新源

### 11.5 为什么只收到一封邮件

这是当前 workflow 的设计。

GitHub Actions 这条路径默认只发：

- 一封跨源汇总报告

不会发：

- GitHub 单独一封
- arXiv 单独一封
- HuggingFace 单独一封

这样更适合“零服务器、低维护”的使用方式。

## 12. 建议的配置顺序

为了少踩坑，建议按这个顺序做：

1. fork 仓库
2. 启用 Actions
3. 只填必填 Secrets
4. 把 `IDEER_DAILY_SOURCES` 先设成默认 4 源
5. 手动跑一次 workflow
6. 确认邮件和 artifact 都正常
7. 再补充高级 Secrets
8. 再考虑启用 `twitter` 等额外源
9. 最后再去改 cron

## 13. 这条方案适合什么场景

适合：

- 没有服务器
- 不想自己装 Python 环境
- 只想每天定时收一封汇总邮件

不适合：

- 想做长期在线 Web 服务
- 想做多用户系统
- 想跑高频、大并发的任务

这些场景还是应该上你自己的后端。
