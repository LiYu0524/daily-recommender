import { useEffect, useMemo, useRef, useState } from "react";
import {
  getConfig,
  getHistory,
  getPublicMeta,
  getResults,
  openRunSocket,
  saveConfig,
} from "./api";
import type {
  ConfigData,
  DeliveryMode,
  HistoryEntry,
  PublicMeta,
  ResultSet,
  RunCompleteMessage,
  RunMessage,
  RunRequest,
  SourceName,
} from "./types";

type ViewName = "dashboard" | "config" | "history";

const SOURCE_OPTIONS: Array<{ key: SourceName; label: string; description: string }> = [
  { key: "github", label: "GitHub", description: "Trending 仓库和工程动态" },
  { key: "huggingface", label: "HuggingFace", description: "论文与模型动态" },
  { key: "twitter", label: "X / Twitter", description: "账号时间线和圈层信号" },
  { key: "arxiv", label: "arXiv", description: "新论文抓取与筛选" },
];

const DEFAULT_CONFIG: ConfigData = {
  desktop_python_path: "",
  provider: "openai",
  model: "gpt-4o-mini",
  base_url: "",
  api_key: "",
  temperature: 0.5,
  smtp_server: "",
  smtp_port: 465,
  sender: "",
  receiver: "",
  smtp_password: "",
  gh_languages: "all",
  gh_since: "daily",
  gh_max_repos: 30,
  hf_content_types: ["papers", "models"],
  hf_max_papers: 30,
  hf_max_models: 15,
  description: "",
  researcher_profile: "",
  x_rapidapi_key: "",
  x_rapidapi_host: "twitter-api45.p.rapidapi.com",
  x_accounts: "",
  arxiv_categories: "cs.AI",
  arxiv_max_entries: 100,
  arxiv_max_papers: 60,
};

const DEFAULT_RUN_FORM: RunRequest = {
  sources: ["github", "huggingface"],
  generate_report: false,
  generate_ideas: false,
  save: true,
  receiver: "",
  description: "",
  researcher_profile: "",
  scholar_url: "",
  x_accounts_input: "",
  delivery_mode: "combined_report",
};

function App() {
  const [activeView, setActiveView] = useState<ViewName>("dashboard");
  const [meta, setMeta] = useState<PublicMeta | null>(null);
  const [config, setConfig] = useState<ConfigData>(DEFAULT_CONFIG);
  const [runForm, setRunForm] = useState<RunRequest>(DEFAULT_RUN_FORM);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedResult, setSelectedResult] = useState<ResultSet | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [runFiles, setRunFiles] = useState<string[]>([]);
  const [runState, setRunState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [statusText, setStatusText] = useState("等待运行");
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    void bootstrap();
    return () => {
      socketRef.current?.close();
    };
  }, []);

  async function bootstrap() {
    try {
      setLoading(true);
      const [metaData, configData, historyData] = await Promise.all([
        getPublicMeta(),
        getConfig(),
        getHistory(),
      ]);
      setMeta(metaData);
      setConfig(configData);
      setRunForm((prev) => ({
        ...prev,
        receiver: configData.receiver,
        description: configData.description,
        researcher_profile: configData.researcher_profile,
      }));
      setHistory(historyData);
    } catch (error) {
      setErrorText(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function refreshHistory() {
    try {
      setHistoryLoading(true);
      setHistory(await getHistory());
    } catch (error) {
      setErrorText(getErrorMessage(error));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleSaveConfig() {
    try {
      setSavingConfig(true);
      setErrorText("");
      await saveConfig(config);
      setRunForm((prev) => ({
        ...prev,
        receiver: config.receiver,
        description: config.description,
        researcher_profile: config.researcher_profile,
      }));
      setStatusText("配置已保存");
    } catch (error) {
      setErrorText(getErrorMessage(error));
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleLoadResult(entry: HistoryEntry) {
    try {
      setSelectedResult(await getResults(entry.type, entry.date));
      setActiveView("history");
    } catch (error) {
      setErrorText(getErrorMessage(error));
    }
  }

  function handleRun() {
    socketRef.current?.close();
    setLogs([]);
    setRunFiles([]);
    setErrorText("");
    setRunState("running");
    setStatusText("任务运行中");

    socketRef.current = openRunSocket(runForm, {
      onMessage: (message) => {
        handleRunMessage(message);
      },
      onClose: () => {
        socketRef.current = null;
      },
      onError: () => {
        setRunState("error");
        setStatusText("WebSocket 连接异常");
      },
    });
  }

  function handleRunMessage(message: RunMessage) {
    if (message.type === "complete") {
      const complete = message as RunCompleteMessage;
      setRunFiles(complete.files);
      setRunState(complete.success ? "done" : "error");
      setStatusText(complete.success ? `完成于 ${complete.date}` : "任务退出");
      void refreshHistory();
      return;
    }

    setLogs((prev) => [...prev, message.message]);
    if (message.type === "error") {
      setRunState("error");
      setStatusText("任务执行失败");
    }
  }

  function updateRunForm<K extends keyof RunRequest>(key: K, value: RunRequest[K]) {
    setRunForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSource(source: SourceName) {
    setRunForm((prev) => {
      const exists = prev.sources.includes(source);
      return {
        ...prev,
        sources: exists ? prev.sources.filter((item) => item !== source) : [...prev.sources, source],
      };
    });
  }

  const summary = useMemo(
    () => ({
      sourceCount: runForm.sources.length,
      mailReady: meta?.mail_enabled ? "已配置" : "未配置",
      twitterReady: meta?.twitter_enabled ? "已配置" : "未配置",
    }),
    [meta, runForm.sources.length],
  );

  if (loading) {
    return <div className="page-shell single-column">正在加载 iDeer 客户端原型...</div>;
  }

  return (
    <div className="page-shell">
      <aside className="sidebar">
        <div className="brand">iD</div>
        <h1>iDeer</h1>
        <p>桌面端 + 网页端共享前端原型</p>

        <nav className="nav-list">
          <button className={navClass(activeView, "dashboard")} onClick={() => setActiveView("dashboard")}>
            控制台
          </button>
          <button className={navClass(activeView, "config")} onClick={() => setActiveView("config")}>
            配置
          </button>
          <button className={navClass(activeView, "history")} onClick={() => setActiveView("history")}>
            历史
          </button>
        </nav>

        <div className="sidebar-meta">
          <div>信息源: {summary.sourceCount}</div>
          <div>邮件: {summary.mailReady}</div>
          <div>X: {summary.twitterReady}</div>
        </div>
      </aside>

      <main className="content">
        <header className="panel header-panel">
          <div>
            <h2>iDeer Client Prototype</h2>
            <p>优先复刻现有网页的布局和功能流程，后续可直接挂到 Tauri。</p>
          </div>
          <div className="status-box">
            <strong>{statusText}</strong>
            <span>后端服务沿用当前 FastAPI / WebSocket</span>
          </div>
        </header>

        {errorText ? <div className="panel error-panel">{errorText}</div> : null}

        {activeView === "dashboard" ? (
          <DashboardView
            runForm={runForm}
            logs={logs}
            runFiles={runFiles}
            runState={runState}
            historyLoading={historyLoading}
            onRun={handleRun}
            onRefreshHistory={refreshHistory}
            onUpdateRunForm={updateRunForm}
            onToggleSource={toggleSource}
          />
        ) : null}

        {activeView === "config" ? (
          <ConfigView config={config} savingConfig={savingConfig} onSave={handleSaveConfig} onChange={setConfig} />
        ) : null}

        {activeView === "history" ? (
          <HistoryView
            history={history}
            selectedResult={selectedResult}
            historyLoading={historyLoading}
            onRefresh={refreshHistory}
            onSelect={handleLoadResult}
          />
        ) : null}
      </main>
    </div>
  );
}

function DashboardView(props: {
  runForm: RunRequest;
  logs: string[];
  runFiles: string[];
  runState: "idle" | "running" | "done" | "error";
  historyLoading: boolean;
  onRun: () => void;
  onRefreshHistory: () => void;
  onUpdateRunForm: <K extends keyof RunRequest>(key: K, value: RunRequest[K]) => void;
  onToggleSource: (source: SourceName) => void;
}) {
  const { runForm, logs, runFiles, runState, historyLoading, onRun, onRefreshHistory, onUpdateRunForm, onToggleSource } = props;

  return (
    <section className="dashboard-grid">
      <div className="panel stack">
        <div className="section-head">
          <h3>运行任务</h3>
          <button className="primary-button" onClick={onRun} disabled={runState === "running" || runForm.sources.length === 0}>
            {runState === "running" ? "运行中..." : "开始运行"}
          </button>
        </div>

        <div className="field-grid sources-grid">
          {SOURCE_OPTIONS.map((source) => (
            <label key={source.key} className={`source-card ${runForm.sources.includes(source.key) ? "selected" : ""}`}>
              <input type="checkbox" checked={runForm.sources.includes(source.key)} onChange={() => onToggleSource(source.key)} />
              <div>
                <strong>{source.label}</strong>
                <p>{source.description}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="field-grid two-columns">
          <label className="field">
            <span>接收邮箱</span>
            <input value={runForm.receiver} onChange={(event) => onUpdateRunForm("receiver", event.target.value)} placeholder="you@example.com" />
          </label>
          <label className="field">
            <span>投递模式</span>
            <select value={runForm.delivery_mode} onChange={(event) => onUpdateRunForm("delivery_mode", event.target.value as DeliveryMode)}>
              <option value="source_emails">分别发送</option>
              <option value="combined_report">只发综合报告</option>
              <option value="both">两者都发</option>
            </select>
          </label>
        </div>

        <div className="inline-toggles">
          <label><input type="checkbox" checked={runForm.generate_report} onChange={(event) => onUpdateRunForm("generate_report", event.target.checked)} /> 生成跨源报告</label>
          <label><input type="checkbox" checked={runForm.generate_ideas} onChange={(event) => onUpdateRunForm("generate_ideas", event.target.checked)} /> 生成研究想法</label>
          <label><input type="checkbox" checked={runForm.save} onChange={(event) => onUpdateRunForm("save", event.target.checked)} /> 保存到 history</label>
        </div>

        <label className="field">
          <span>兴趣描述</span>
          <textarea rows={6} value={runForm.description} onChange={(event) => onUpdateRunForm("description", event.target.value)} />
        </label>

        <div className="field-grid two-columns">
          <label className="field">
            <span>Scholar URL</span>
            <input value={runForm.scholar_url} onChange={(event) => onUpdateRunForm("scholar_url", event.target.value)} placeholder="https://scholar.google.com/..." />
          </label>
          <label className="field">
            <span>本次追加 X 账号</span>
            <textarea rows={4} value={runForm.x_accounts_input} onChange={(event) => onUpdateRunForm("x_accounts_input", event.target.value)} placeholder="@user1 或 x.com/user2" />
          </label>
        </div>

        <label className="field">
          <span>研究者画像</span>
          <textarea rows={8} value={runForm.researcher_profile} onChange={(event) => onUpdateRunForm("researcher_profile", event.target.value)} />
        </label>
      </div>

      <div className="stack">
        <div className="panel stack">
          <div className="section-head">
            <h3>实时日志</h3>
            <span className={`badge badge-${runState}`}>{runState}</span>
          </div>
          <div className="log-view">
            {logs.length === 0 ? <div className="muted">还没有运行日志。</div> : logs.map((line, index) => <div key={`${index}-${line}`}>{line}</div>)}
          </div>
        </div>

        <div className="panel stack">
          <div className="section-head">
            <h3>本次输出</h3>
            <button className="secondary-button" onClick={onRefreshHistory} disabled={historyLoading}>
              {historyLoading ? "刷新中..." : "刷新历史"}
            </button>
          </div>
          {runFiles.length === 0 ? (
            <div className="muted">完成后会在这里列出生成文件。</div>
          ) : (
            <ul className="file-list">
              {runFiles.map((file) => <li key={file}>{file}</li>)}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function ConfigView(props: { config: ConfigData; savingConfig: boolean; onSave: () => void; onChange: (value: ConfigData) => void }) {
  const { config, savingConfig, onSave, onChange } = props;
  const update = <K extends keyof ConfigData,>(key: K, value: ConfigData[K]) => onChange({ ...config, [key]: value });

  return (
    <section className="panel stack">
      <div className="section-head">
        <h3>配置管理</h3>
        <button className="primary-button" onClick={onSave} disabled={savingConfig}>
          {savingConfig ? "保存中..." : "保存配置"}
        </button>
      </div>

      <div className="field-grid three-columns">
        <label className="field"><span>Provider</span><input value={config.provider} onChange={(event) => update("provider", event.target.value)} /></label>
        <label className="field"><span>Model</span><input value={config.model} onChange={(event) => update("model", event.target.value)} /></label>
        <label className="field"><span>Temperature</span><input type="number" step="0.1" value={config.temperature} onChange={(event) => update("temperature", Number(event.target.value))} /></label>
      </div>

      <div className="field-grid two-columns">
        <label className="field"><span>Base URL</span><input value={config.base_url} onChange={(event) => update("base_url", event.target.value)} /></label>
        <label className="field"><span>API Key</span><input value={config.api_key} onChange={(event) => update("api_key", event.target.value)} /></label>
      </div>

      <div className="field-grid three-columns">
        <label className="field"><span>SMTP Server</span><input value={config.smtp_server} onChange={(event) => update("smtp_server", event.target.value)} /></label>
        <label className="field"><span>SMTP Port</span><input type="number" value={config.smtp_port} onChange={(event) => update("smtp_port", Number(event.target.value))} /></label>
        <label className="field"><span>Sender</span><input value={config.sender} onChange={(event) => update("sender", event.target.value)} /></label>
      </div>

      <div className="field-grid two-columns">
        <label className="field"><span>Receiver</span><input value={config.receiver} onChange={(event) => update("receiver", event.target.value)} /></label>
        <label className="field"><span>SMTP Password</span><input value={config.smtp_password} onChange={(event) => update("smtp_password", event.target.value)} /></label>
      </div>

      <div className="field-grid three-columns">
        <label className="field"><span>GitHub Languages</span><input value={config.gh_languages} onChange={(event) => update("gh_languages", event.target.value)} /></label>
        <label className="field"><span>GitHub Since</span><input value={config.gh_since} onChange={(event) => update("gh_since", event.target.value)} /></label>
        <label className="field"><span>GitHub Max Repos</span><input type="number" value={config.gh_max_repos} onChange={(event) => update("gh_max_repos", Number(event.target.value))} /></label>
      </div>

      <div className="field-grid three-columns">
        <label className="field"><span>HF Content Types</span><input value={config.hf_content_types.join(" ")} onChange={(event) => update("hf_content_types", splitTokens(event.target.value))} /></label>
        <label className="field"><span>HF Max Papers</span><input type="number" value={config.hf_max_papers} onChange={(event) => update("hf_max_papers", Number(event.target.value))} /></label>
        <label className="field"><span>HF Max Models</span><input type="number" value={config.hf_max_models} onChange={(event) => update("hf_max_models", Number(event.target.value))} /></label>
      </div>

      <div className="field-grid two-columns">
        <label className="field"><span>X RapidAPI Key</span><input value={config.x_rapidapi_key} onChange={(event) => update("x_rapidapi_key", event.target.value)} /></label>
        <label className="field"><span>X RapidAPI Host</span><input value={config.x_rapidapi_host} onChange={(event) => update("x_rapidapi_host", event.target.value)} /></label>
      </div>

      <div className="field-grid three-columns">
        <label className="field"><span>arXiv Categories</span><input value={config.arxiv_categories} onChange={(event) => update("arxiv_categories", event.target.value)} /></label>
        <label className="field"><span>arXiv Max Entries</span><input type="number" value={config.arxiv_max_entries} onChange={(event) => update("arxiv_max_entries", Number(event.target.value))} /></label>
        <label className="field"><span>arXiv Max Papers</span><input type="number" value={config.arxiv_max_papers} onChange={(event) => update("arxiv_max_papers", Number(event.target.value))} /></label>
      </div>

      <label className="field"><span>默认兴趣描述</span><textarea rows={6} value={config.description} onChange={(event) => update("description", event.target.value)} /></label>

      <div className="field-grid two-columns">
        <label className="field"><span>研究者画像</span><textarea rows={10} value={config.researcher_profile} onChange={(event) => update("researcher_profile", event.target.value)} /></label>
        <label className="field"><span>X 账号池</span><textarea rows={10} value={config.x_accounts} onChange={(event) => update("x_accounts", event.target.value)} /></label>
      </div>
    </section>
  );
}

function HistoryView(props: {
  history: HistoryEntry[];
  selectedResult: ResultSet | null;
  historyLoading: boolean;
  onRefresh: () => void;
  onSelect: (entry: HistoryEntry) => void;
}) {
  const { history, selectedResult, historyLoading, onRefresh, onSelect } = props;

  return (
    <section className="history-grid">
      <div className="panel stack">
        <div className="section-head">
          <h3>历史记录</h3>
          <button className="secondary-button" onClick={onRefresh} disabled={historyLoading}>
            {historyLoading ? "刷新中..." : "刷新"}
          </button>
        </div>
        {history.length === 0 ? (
          <div className="muted">还没有历史记录。</div>
        ) : (
          <div className="history-list">
            {history.map((entry) => (
              <button key={entry.id} className="history-card" onClick={() => onSelect(entry)}>
                <strong>{entry.type}</strong>
                <span>{entry.date}</span>
                <span>{entry.items} items</span>
                <span>{entry.path}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="panel stack">
        <div className="section-head">
          <h3>结果详情</h3>
        </div>
        {!selectedResult ? (
          <div className="muted">点击左侧历史记录查看详情。</div>
        ) : (
          <div className="result-view stack">
            <div className="result-meta">
              <strong>{selectedResult.source}</strong>
              <span>{selectedResult.date}</span>
            </div>

            <div className="result-section">
              <h4>Markdown</h4>
              {selectedResult.markdown_files.length === 0 ? <div className="muted">无 Markdown 文件</div> : selectedResult.markdown_files.map((file) => (
                <details key={file.name} open>
                  <summary>{file.name}</summary>
                  <pre>{file.content}</pre>
                </details>
              ))}
            </div>

            <div className="result-section">
              <h4>HTML</h4>
              {selectedResult.html_files.length === 0 ? <div className="muted">无 HTML 文件</div> : (
                <ul className="file-list">
                  {selectedResult.html_files.map((file) => (
                    <li key={file.name}><a href={file.url} target="_blank" rel="noreferrer">{file.name}</a></li>
                  ))}
                </ul>
              )}
            </div>

            <div className="result-section">
              <h4>JSON</h4>
              {selectedResult.json_files.length === 0 ? <div className="muted">无 JSON 文件</div> : selectedResult.json_files.map((file) => (
                <details key={file.name}>
                  <summary>{file.name}</summary>
                  <pre>{JSON.stringify(file.data, null, 2)}</pre>
                </details>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function navClass(activeView: ViewName, buttonView: ViewName) {
  return activeView === buttonView ? "nav-button active" : "nav-button";
}

function splitTokens(value: string) {
  return value.split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "发生未知错误";
}

export default App;
