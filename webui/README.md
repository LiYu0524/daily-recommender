# iDeer Web UI

iDeer 的浏览器端前端，基于 React 构建，替代原有的 HTML 内嵌模板。

## 技术栈

- React 19 + TypeScript
- Vite 6
- Tailwind CSS 3.4
- React Router 7

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 构建
npm run build

# 预览构建结果
npm run preview
```

开发服务器通过 Vite proxy 将 `/api` 和 `/ws` 请求转发到后端 `localhost:8090`，需要先启动后端服务（`python web_server.py`）。

## 页面结构

| 路由       | 说明                 | 状态     |
| ---------- | -------------------- | -------- |
| `/`        | 公开页 -- 触发运行和查看结果 | 已完成   |
| `/admin`   | 管理后台 -- 配置/控制台/历史 | 已完成   |
| `/desktop` | 桌面端嵌入           | 待开发   |

## 项目结构

```
src/
  App.tsx                          # 路由入口
  main.tsx                         # 应用入口
  index.css                        # Tailwind 基础样式 + 自定义 CSS
  components/                      # 跨页面共享组件
    MarkdownRender.tsx             # Markdown 渲染
    Toast.tsx                      # 通知组件
  lib/
    api.ts                         # HTTP / WebSocket 通信层
    types.ts                       # 类型定义（含 AdminConfig / HistoryEntry 等）
    constants.ts                   # 常量（含 TYPE_COLORS / TYPE_LABELS 等）
    utils.ts                       # 工具函数
    hooks/
      useMeta.ts                   # 公开页元信息获取
      useWebSocket.ts              # WebSocket 管理
      useToast.tsx                 # 通知状态
      useDesktopEmbed.ts           # 桌面嵌入检测
      useConfig.ts                 # 配置加载/编辑/保存
      useHistory.ts                # 历史记录加载
      useRunState.ts               # WebSocket 运行生命周期
  pages/
    public/
      PublicPage.tsx               # 公开页主组件
      components/
        Header.tsx                 # 页头 + 模式切换
        HeroSection.tsx            # 标题区域
        MailWarning.tsx            # SMTP 未配置警告
        SendForm.tsx               # Quick / Custom 发送表单
        SourceSelection.tsx        # 数据源选择
        SourceCard.tsx             # 数据源卡片
        DeliveryToggle.tsx         # 投递方式切换
        RunProgress.tsx            # 运行进度条
        ResultPanel.tsx            # 结果面板
        FileCard.tsx               # 文件卡片
    admin/                         # 管理后台
      AdminPage.tsx                # 顶层编排（Tab 切换 + Hook 调用）
      components/
        Header.tsx                 # 导航栏 + Tab 按钮
        config/                    # 配置 Tab
          ConfigView.tsx           # 配置容器 + 保存按钮
          LLMConfig.tsx            # LLM 配置（Provider / Model / Key 等）
          EmailConfig.tsx          # 邮件配置（SMTP）
          SourceConfig.tsx         # 信息源配置（GitHub / HF / Twitter / arXiv / SS）
          InterestConfig.tsx       # 兴趣描述
          ProfileConfig.tsx        # 研究者画像
          ScheduleConfig.tsx       # 定时推送
        dashboard/                 # 控制台 Tab
          DashboardView.tsx        # 控制台容器
          QuickActions.tsx         # 快速运行 / 生成报告 / 研究想法
          SourceSelection.tsx      # 数据源选择网格
          SourceCard.tsx           # 数据源卡片（含配置摘要）
          RunPanel.tsx             # 运行进度 + 日志 + 取消
          ResultsPanel.tsx         # 运行结果展示
        records/                   # 历史 Tab
          HistoryView.tsx          # 历史记录容器 + 筛选
          HistoryList.tsx          # 历史卡片列表
          ResultModal.tsx          # 结果详情弹窗
    desktop/                       # 桌面端（待开发）
```
