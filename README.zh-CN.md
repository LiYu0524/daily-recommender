# iDeer

> 这倒是提醒我了，中文名叫 i鹿。

<p align="center">
  <img src="./docs/ideer-teaser.jpg" alt="iDeer teaser" width="360" />
</p>

<p align="center">
  GitHub · HuggingFace · arXiv · X / Twitter → 日报 · 简报 · 点子
</p>

iDeer 是一只替你刷技术情报的赛博鹿。

你给它一份兴趣画像，它去盯 `GitHub`、`HuggingFace`、`arXiv` 和 `X / Twitter`，把一天里值得看的 repo、论文、模型和讨论，整理成更像人能读完的东西。

它主要产出三类内容：

- `日报`
- `跨源 briefing / report`
- `顺手长出来的 research ideas`

一句人话：你负责定义口味，`i鹿` 负责“这倒是提醒我了”。

## 快速开始

需要 `Python 3.10+`。

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

先在 `.env` 里填最少三项：

```env
MODEL_NAME=
BASE_URL=
API_KEY=
```

把你的兴趣写进 `profiles/description.txt`，然后先跑一个不发邮件的本地版本：

```bash
.venv/bin/python main.py \
  --sources github huggingface arxiv \
  --save \
  --skip_source_emails
```

如果你要跑完整的“日报机”：

- 配好 `SMTP_*` 才能发邮件
- 配好 `X_RAPIDAPI_KEY` 才能接入 `X / Twitter`
- 把 `GENERATE_REPORT=1`、`GENERATE_IDEAS=1` 打开，就会额外生成报告和点子
- 用 `bash scripts/run_daily.sh` 跑默认流水线

## 输出

- `history/<source>/<date>/`：每个 source 的摘要、HTML 和缓存
- `history/reports/<date>/report.md`：开启 report 后生成的跨源报告
- `history/ideas/<date>/ideas.json`：开启 ideas 后生成的当天点子

## 更多

- 技术说明：[docs/TECHNICAL.md](./docs/TECHNICAL.md)
- 桌面 demo：[docs/DESKTOP_DEMO.md](./docs/DESKTOP_DEMO.md)
