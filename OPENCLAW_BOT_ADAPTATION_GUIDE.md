# OpenClaw Telegram/Feishu Bot 接入调研与 iDeer 适配指南

更新时间：2026-04-12

## 1. 结论速览

OpenClaw 的 Telegram/Feishu 接入不是“单一 webhook handler”，而是一个稳定的四层结构：

1. Channel 插件层：声明能力、配置、动作路由、会话路由。
2. Monitor/Transport 层：负责 Webhook 或 WebSocket/Polling 连接生命周期。
3. Inbound 处理层：鉴权、去重、限流、顺序队列、事件归一化。
4. Outbound Action 层：统一消息动作接口（send/edit/delete/react/poll 等）。

对 iDeer 来说，可直接借鉴的关键不是 UI 或框架，而是三点：

1. 把渠道传输和业务处理彻底分离。
2. 所有入站事件先做“安全边界 + 幂等 + 顺序控制”再进 agent。
3. 通过统一动作接口屏蔽 Telegram/Feishu 的差异。

---

## 2. OpenClaw 中 Telegram 的接入方式

### 2.1 启动入口与模式选择

核心入口在 `monitorTelegramProvider(...)`：

- 当 `useWebhook=true`：走 `startTelegramWebhook(...)`。
- 否则：走 polling session（长期轮询），并持久化 update offset 防重复消费。

这意味着 Telegram 的“接入模式选择”在 monitor 层，而不是散落在 handler 里。

### 2.2 Webhook 安全与稳定性

`startTelegramWebhook(...)` 的关键安全措施：

1. 强制要求非空 secret。
2. 使用 header `x-telegram-bot-api-secret-token` 做常量时间比较。
3. 在鉴权前就执行基础防护（速率限制、请求防护），防止 secret 猜测放大攻击。
4. 限制 body 大小/超时（大包、慢连接、断连都明确返回码）。
5. 以 grammy webhook callback 执行 update，并设置超时与 unauthorized 回调。

关键实现思路（抽象后）：

```text
HTTP POST -> basic guards(rate limit/body timeout) -> secret verify
-> parse update -> invoke bot handler -> 200
```

### 2.3 入站事件处理链

`createTelegramBot(...)` 内部做了完整链路装配：

1. 注册 update 去重与 watermark 持久化。
2. 按 chat/thread 维度顺序串行（sequentialize key）。
3. 构建 message processor（权限、mention、thread、history、streaming 等策略都在这里汇总）。
4. 注册 native commands 与通用 handlers。

这个结构的价值：任何新能力都通过 processor/handler 插件化扩展，不污染传输层。

### 2.4 出站动作接口

Telegram 不是“直接随处 sendMessage”，而是统一到 action runtime：

- `sendMessage`
- `poll`
- `editMessage`
- `deleteMessage`
- `react`
- `topic-create` 等

并且每个动作有 gate（可按账号、配置开关禁用），避免 agent 滥用。

---

## 3. OpenClaw 中 Feishu 的接入方式

### 3.1 连接模式与账号管理

Feishu monitor 支持两种模式：

1. `connectionMode=websocket`（默认）。
2. `connectionMode=webhook`。

monitor 支持多账号并发启动，每个账号独立 transport、独立 bot identity、独立 dedup 状态。

### 3.2 Webhook 校验关键点

Feishu webhook 关键校验逻辑：

1. 若配置了 `encryptKey`，必须校验签名。
2. 签名算法：

$$
signature = SHA256(timestamp + nonce + encryptKey + rawBody)
$$

3. 先验签，再 JSON parse（严格 auth boundary）。
4. challenge 包使用 SDK 的 `generateChallenge(...)` 直接返回 challenge。

这套流程非常值得照搬。

### 3.3 事件分发与幂等

Feishu 通过 event dispatcher 注册多个事件：

- `im.message.receive_v1`
- `card.action.trigger`
- `im.message.reaction.created_v1`
- `im.message.reaction.deleted_v1`
- `application.bot.menu_v6`
- 可选 `drive.notice.comment_add_v1`

每类事件都走统一模式：

1. parse + schema 校验。
2. dedup claim（in-flight 防重入）。
3. 按会话 key 进入顺序队列。
4. 交给 `handleFeishuMessage(...)` 或专用 handler。

### 3.4 文本防抖与合并

Feishu 入站包含 debounce 机制：

- 只对文本进行短窗口聚合。
- 控制命令（如 stop/btw）不防抖，立即走控制通道。
- 合并后仍保留 mention 语义和 message_id 幂等处理。

这是生产环境高频群聊里非常实用的设计。

---

## 4. 可抽象出的通用 Bot 框架（建议 iDeer 采用）

建议抽象成下面 6 个层：

1. `transport`：收发协议（Telegram webhook/polling，Feishu webhook/ws）。
2. `security`：签名、secret、速率限制、body 限制、IP 信任链。
3. `inbound normalizer`：把不同平台事件统一成同一模型。
4. `session router`：按 channel/account/conversation/thread 映射会话。
5. `agent runtime`：业务决策与 LLM 调用。
6. `action adapter`：send/edit/react/reply 等统一动作到渠道 API。

---

## 5. iDeer 当前结构与最小侵入接入点

当前 iDeer 现状：

1. 主流程以批处理为主（`main.py` + `sources/*`）。
2. 已有 FastAPI 服务（`web_server.py`），适合作为 webhook 入口承载。
3. 目前缺少“会话式 agent runtime”与“渠道动作层”抽象。

最小侵入路线：

1. 在现有 FastAPI 上新增 bot 路由，不改动现有日报链路。
2. 新建 `bot/` 目录实现隔离模块。
3. 让 bot 能触发现有能力（run/report/ideas/status）作为第一阶段。

---

## 6. 面向 iDeer 的目标模块设计

建议新增目录（示意）：

```text
bot/
  __init__.py
  models.py                 # UnifiedInboundEvent / UnifiedOutboundAction
  security.py               # telegram secret, feishu signature, rate limit
  session_store.py          # state/bot_sessions/*
  router.py                 # 会话路由 + 命令路由
  runtime.py                # bot->agent 入口（复用 llm/GPT.py）
  manager.py                # 启停、账号配置、模式切换
  channels/
    telegram_inbound.py     # webhook update -> unified event
    telegram_outbound.py    # send/edit/react...
    feishu_inbound.py       # webhook/ws event -> unified event
    feishu_outbound.py      # send/edit/reply/card...
  transports/
    telegram_webhook.py
    feishu_webhook.py
    feishu_ws.py
```

同时在 `web_server.py` 添加：

1. `POST /bot/telegram/webhook`
2. `POST /bot/feishu/webhook`
3. 可选 `GET /bot/health`

---

## 7. 推荐统一接口（给 coding agent 直接实现）

### 7.1 统一入站事件

```python
from pydantic import BaseModel
from typing import Literal, Optional, Dict, Any

class UnifiedInboundEvent(BaseModel):
    channel: Literal["telegram", "feishu"]
    account_id: str = "default"
    event_id: str
    chat_id: str
    thread_id: Optional[str] = None
    sender_id: str
    sender_name: Optional[str] = None
    text: str = ""
    raw_event: Dict[str, Any] = {}
```

### 7.2 统一出站动作

```python
class UnifiedOutboundAction(BaseModel):
    channel: Literal["telegram", "feishu"]
    account_id: str = "default"
    action: Literal["send", "edit", "delete", "react"]
    to: str
    thread_id: Optional[str] = None
    content: Optional[str] = None
    reply_to_message_id: Optional[str] = None
    message_id: Optional[str] = None
    extra: Dict[str, Any] = {}
```

### 7.3 runtime 入口

```python
async def handle_inbound_event(event: UnifiedInboundEvent) -> list[UnifiedOutboundAction]:
    """统一业务入口：命令解析 -> LLM/任务执行 -> 动作列表"""
```

---

## 8. 关键流程伪代码

### 8.1 Telegram webhook handler

```python
async def telegram_webhook(request):
    apply_rate_limit_before_auth(request)
    verify_header_secret(request.headers["x-telegram-bot-api-secret-token"])
    body = await read_json_with_limit(request, max_bytes=1_048_576, timeout=30)
    event = telegram_to_unified(body)
    if is_duplicate(event.event_id):
        return {"ok": True}
    async with sequential_lock(key=f"tg:{event.account_id}:{event.chat_id}:{event.thread_id or 'chat'}"):
        actions = await handle_inbound_event(event)
        await dispatch_actions(actions)
    return {"ok": True}
```

### 8.2 Feishu webhook 验签与 challenge

```python
def verify_feishu_signature(headers, raw_body, encrypt_key):
    ts = headers.get("x-lark-request-timestamp")
    nonce = headers.get("x-lark-request-nonce")
    sig = headers.get("x-lark-signature")
    computed = sha256(ts + nonce + encrypt_key + raw_body)
    return constant_time_compare(computed, sig)

async def feishu_webhook(request):
    raw_body = await read_raw_body_with_limit(request)
    if not verify_feishu_signature(request.headers, raw_body, encrypt_key):
        return PlainTextResponse("Invalid signature", status_code=401)
    payload = json.loads(raw_body)
    if is_feishu_challenge(payload):
        return JSONResponse({"challenge": payload["challenge"]})
    event = feishu_to_unified(payload)
    ...
```

### 8.3 命令路由（先做 MVP）

```text
/status -> 返回模型、配置、最近一次运行时间
/run <sources...> -> 调用现有 main.py（建议走异步任务）
/report -> 触发 generate_report
/ideas -> 触发 generate_ideas
/help -> 返回能力列表
```

---

## 9. 配置项建议（.env）

```bash
# Telegram
BOT_TELEGRAM_ENABLED=1
BOT_TELEGRAM_MODE=webhook
BOT_TELEGRAM_TOKEN=
BOT_TELEGRAM_WEBHOOK_SECRET=
BOT_TELEGRAM_WEBHOOK_PATH=/bot/telegram/webhook

# Feishu
BOT_FEISHU_ENABLED=1
BOT_FEISHU_MODE=webhook
BOT_FEISHU_APP_ID=
BOT_FEISHU_APP_SECRET=
BOT_FEISHU_VERIFICATION_TOKEN=
BOT_FEISHU_ENCRYPT_KEY=
BOT_FEISHU_WEBHOOK_PATH=/bot/feishu/webhook

# 通用
BOT_DEFAULT_ACCOUNT=default
BOT_RATE_LIMIT_RPS=5
BOT_MAX_BODY_BYTES=1048576
BOT_DM_POLICY=allowlist
BOT_ALLOW_FROM=
```

---

## 10. coding agent 分阶段任务单

### Phase 1: 基础骨架

1. 新建 `bot/` 模块与统一事件模型。
2. 新增 Telegram/Feishu webhook 路由并能过健康检查。
3. 完成基础鉴权（Telegram secret + Feishu signature）。

验收：

1. 无效 secret/signature 返回 401。
2. challenge 可正确回包。

### Phase 2: 入站到 agent 贯通

1. 实现 event normalize。
2. 实现 dedup + sequential queue。
3. 实现 `/help` `/status` `/run` 命令路由。

验收：

1. 同一 event_id 不重复执行。
2. 同一 chat/thread 顺序一致。

### Phase 3: 出站动作层

1. 抽象统一 action 并接入 Telegram/Feishu 发送。
2. 支持 reply_to 与 thread。
3. 完成错误重试与日志。

验收：

1. 两个平台都可发送文本回复。
2. 可按 thread 上下文回复。

### Phase 4: 策略与稳定性

1. 接入 allowlist/pairing 策略。
2. 加入 body limit、timeout、rate limit。
3. 完善单测（鉴权、幂等、顺序、路由）。

验收：

1. 压测下不出现重复响应。
2. 控制命令与普通消息行为符合预期。

---

## 11. 实施注意点

1. iDeer 目前是批处理产品，bot 侧不要直接阻塞执行长任务，必须异步化并回执任务状态。
2. `main.py` 当前强依赖 SMTP 等配置，bot 触发 run 时要允许 “只执行不发邮件” 的参数模板。
3. 先做文本 MVP，不要第一版引入卡片、媒体、reaction 全量能力。
4. 将 channel credential 与业务配置分离，避免把 bot key 混入普通运行配置覆盖流程。

---

## 12. 调研依据（OpenClaw 关键实现点）

本指南基于 openclaw 仓库中 Telegram/Feishu 相关实现链路整理，重点核对了：

1. Telegram monitor/webhook/bot/action runtime。
2. Feishu monitor/transport/account dispatcher/card action。
3. 两者的文档配置与运行时动作面。

可按本文的接口与 phase 直接让 coding agent 开始实现。
