import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faBolt,
  faCircleInfo,
  faCircleQuestion,
  faCompress,
  faFileLines,
  faFloppyDisk,
  faGear,
  faInbox,
  faLayerGroup,
  faLightbulb,
  faMinus,
  faMoon,
  faPalette,
  faPlay,
  faRotate,
  faSquare,
  faStop,
  faSun,
  faUpRightFromSquare,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import type { AppCopy, LanguagePreference, ThemePreference } from "./copy";
import type { AvatarId, ConfigData, HistoryEntry, MainContributor, ResultSet, RunRequest, SourceName, UserProfile } from "./types";
import { closeWindow, isTauriDesktop, isWindowMaximized, minimizeWindow, openExternalUrl, toggleWindowMaximize } from "./desktop";

type RunState = "idle" | "running" | "done" | "error";
type SourceCard = { key: SourceName; label: string; description: string; icon: string; selected: boolean };
type InterestTags = { positive: string[]; negative: string[] };

function uniqueTags(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function splitInterestLine(value: string) {
  return uniqueTags(value.split(/[|,，;；、\n]/g));
}

function parseInterestDescription(value: string): InterestTags {
  const raw = value.trim();
  if (!raw) {
    return { positive: [], negative: [] };
  }

  const positive: string[] = [];
  const negative: string[] = [];
  let parsedStructured = false;

  for (const line of raw.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    if (/^(positive|正向|喜欢|关注)\s*:/i.test(line)) {
      positive.push(...splitInterestLine(line.replace(/^[^:：]+[:：]\s*/u, "")));
      parsedStructured = true;
      continue;
    }
    if (/^(negative|负向|排除|屏蔽)\s*:/i.test(line)) {
      negative.push(...splitInterestLine(line.replace(/^[^:：]+[:：]\s*/u, "")));
      parsedStructured = true;
      continue;
    }
    if (/^[+＋]\s*/u.test(line)) {
      positive.push(line.replace(/^[+＋]\s*/u, ""));
      parsedStructured = true;
      continue;
    }
    if (/^[-－]\s*/u.test(line)) {
      negative.push(line.replace(/^[-－]\s*/u, ""));
      parsedStructured = true;
      continue;
    }
  }

  if (!parsedStructured) {
    return { positive: splitInterestLine(raw), negative: [] };
  }

  return {
    positive: uniqueTags(positive),
    negative: uniqueTags(negative),
  };
}

function serializeInterestDescription(tags: InterestTags) {
  const lines: string[] = [];
  if (tags.positive.length > 0) {
    lines.push(`Positive: ${tags.positive.join(" | ")}`);
  }
  if (tags.negative.length > 0) {
    lines.push(`Negative: ${tags.negative.join(" | ")}`);
  }
  return lines.join("\n");
}

function ControlButtonContent(props: { icon: IconDefinition; label: string }) {
  return (
    <>
      <span className="button-icon" aria-hidden="true">
        <FontAwesomeIcon icon={props.icon} />
      </span>
      <span className="button-label">{props.label}</span>
    </>
  );
}

export function TitleBar(props: { backendHealthy: boolean; statusText: string; previewBadge: string; title: string; copy: AppCopy }) {
  const desktop = isTauriDesktop();
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!desktop) {
      return;
    }
    let mounted = true;
    const sync = async () => {
      const next = await isWindowMaximized();
      if (mounted) {
        setIsMaximized(next);
      }
    };
    void sync();
    const timer = window.setInterval(() => void sync(), 800);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [desktop]);

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region>
        <span className="titlebar-title">{props.title}</span>
        <span className={`connection-dot ${props.backendHealthy ? "online" : "offline"}`} />
        <span className="titlebar-status">{props.statusText}</span>
      </div>
      <div className="titlebar-right">
        {!desktop ? <span className="titlebar-badge">{props.previewBadge}</span> : null}
        {desktop && (
          <div className="window-controls">
            <button className="window-control minimize" aria-label={props.copy.windowControls.minimize} onClick={() => void minimizeWindow()}>
              <FontAwesomeIcon icon={faMinus} />
            </button>
            <button
              className="window-control maximize"
              aria-label={isMaximized ? props.copy.windowControls.restore : props.copy.windowControls.maximize}
              onClick={() => void toggleWindowMaximize()}
            >
              <FontAwesomeIcon icon={isMaximized ? faCompress : faSquare} />
            </button>
            <button className="window-control close" aria-label={props.copy.windowControls.close} onClick={() => void closeWindow()}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ControlCenter(props: {
  panel: "none" | "settings";
  initialTab?: "profile" | "preferences" | "subscriptions" | "mail" | "info";
  detached?: boolean;
  onClose: () => void;
  userProfile: UserProfile;
  avatars: Array<{ key: AvatarId; src: string }>;
  backendHealthy: boolean;
  startingBackend: boolean;
  statusText: string;
  config: ConfigData;
  savingConfig: boolean;
  savingProfile: boolean;
  testingConnection: boolean;
  connectionTestResult: { kind: "idle" | "success" | "error"; message: string };
  testingSmtpConnection: boolean;
  smtpTestResult: { kind: "idle" | "success" | "error"; message: string };
  onChangeConfig: (value: ConfigData) => void;
  onChangeUserProfile: (value: UserProfile) => void;
  onSave: () => Promise<void>;
  onTestConnection: () => Promise<void>;
  onTestSmtpConnection: () => Promise<void>;
  onSaveProfile: () => Promise<void>;
  onStartBackend: () => Promise<void>;
  onStopBackend: () => Promise<void>;
  onRefresh: () => Promise<void>;
  copy: AppCopy;
  appIcon: string;
  githubUrl: string;
  contributors: MainContributor[];
  languagePreference: LanguagePreference;
  themePreference: ThemePreference;
  onChangeLanguage: (value: LanguagePreference) => void;
  onChangeTheme: (value: ThemePreference) => void;
}) {
  const set = <K extends keyof ConfigData,>(key: K, value: ConfigData[K]) => props.onChangeConfig({ ...props.config, [key]: value });
  const setProfile = <K extends keyof UserProfile,>(key: K, value: UserProfile[K]) => props.onChangeUserProfile({ ...props.userProfile, [key]: value });
  const [activeTab, setActiveTab] = useState<"profile" | "preferences" | "subscriptions" | "mail" | "info">(props.initialTab ?? "profile");
  useEffect(() => {
    setActiveTab(props.initialTab ?? "profile");
  }, [props.initialTab]);
  if (props.panel === "none") return null;

  const panelBody = (
    <aside className={props.detached ? "control-center-panel detached" : "control-center-panel"} onClick={(event) => event.stopPropagation()}>
        <div className="control-tabs">
          <button className={activeTab === "profile" ? "control-tab active" : "control-tab"} onClick={() => setActiveTab("profile")}>{props.copy.settings.profile}</button>
          <button className={activeTab === "preferences" ? "control-tab active" : "control-tab"} onClick={() => setActiveTab("preferences")}>{props.copy.settings.preferences}</button>
          <button className={activeTab === "subscriptions" ? "control-tab active" : "control-tab"} onClick={() => setActiveTab("subscriptions")}>{props.copy.settings.subscriptionSettings}</button>
          <button className={activeTab === "mail" ? "control-tab active" : "control-tab"} onClick={() => setActiveTab("mail")}>{props.copy.settings.mailHostingSettings}</button>
          <button className={activeTab === "info" ? "control-tab active" : "control-tab"} onClick={() => setActiveTab("info")}>{props.copy.info.title}</button>
        </div>

        {activeTab === "profile" ? <section className="control-section">
          <div className="control-section-title"><FontAwesomeIcon icon={faGear} /> <span>{props.copy.settings.profile}</span></div>
          <div className="profile-card">
            <img src={props.avatars.find((item) => item.key === props.userProfile.avatar)?.src} alt={props.userProfile.name || props.copy.user.fallbackName} className="profile-avatar-large" />
            <div className="profile-copy">
              <strong>{props.userProfile.name || props.copy.user.fallbackName}</strong>
              <p>{props.userProfile.focus || props.copy.user.fallbackFocus}</p>
            </div>
          </div>
          <div className="avatar-choice-grid">
            {props.avatars.map((avatar) => (
              <button
                key={avatar.key}
                className={props.userProfile.avatar === avatar.key ? "avatar-choice active" : "avatar-choice"}
                onClick={() => setProfile("avatar", avatar.key)}
              >
                <img src={avatar.src} alt={avatar.key} className="avatar-choice-image" />
              </button>
            ))}
          </div>
          <div className="form-grid two">
            <label className="form-field"><span>{props.copy.settings.userName}</span><input value={props.userProfile.name} onChange={(event) => setProfile("name", event.target.value)} /></label>
            <label className="form-field"><span>{props.copy.settings.userReceiver}</span><input value={props.userProfile.receiver} onChange={(event) => setProfile("receiver", event.target.value)} /></label>
          </div>
          <label className="form-field"><span>{props.copy.settings.userFocus}</span><textarea rows={4} value={props.userProfile.focus} onChange={(event) => setProfile("focus", event.target.value)} /></label>
          <div className="metric-actions">
            <button className="primary-action" onClick={() => void props.onSaveProfile()} disabled={props.savingProfile}>{props.savingProfile ? props.copy.settings.saving : props.copy.settings.saveProfile}</button>
          </div>
        </section> : null}

        {activeTab === "preferences" ? <section className="control-section">
          <div className="control-section-title"><FontAwesomeIcon icon={faPalette} /> <span>{props.copy.settings.preferences}</span></div>
          <label className="form-field"><span>{props.copy.settings.theme}</span><select value={props.themePreference} onChange={(event) => props.onChangeTheme(event.target.value as ThemePreference)}><option value="system">{props.copy.settings.followSystem}</option><option value="light">{props.copy.settings.light}</option><option value="dark">{props.copy.settings.dark}</option></select></label>
          <div className="quick-theme-row">
            <button className="secondary-action" onClick={() => props.onChangeTheme("light")}><FontAwesomeIcon icon={faSun} /> {props.copy.settings.light}</button>
            <button className="secondary-action" onClick={() => props.onChangeTheme("dark")}><FontAwesomeIcon icon={faMoon} /> {props.copy.settings.dark}</button>
          </div>
          <label className="form-field"><span>{props.copy.settings.language}</span><select value={props.languagePreference} onChange={(event) => props.onChangeLanguage(event.target.value as LanguagePreference)}><option value="system">{props.copy.settings.followSystem}</option><option value="zh">{props.copy.settings.chinese}</option><option value="en">{props.copy.settings.english}</option></select></label>
        </section> : null}

        {activeTab === "subscriptions" ? <section className="control-section">
          <div className="control-section-title"><FontAwesomeIcon icon={faRotate} /> <span>{props.copy.home.backend}</span></div>
          <div className="control-status-card">
            <strong>{props.backendHealthy ? props.copy.info.online : props.copy.info.offline}</strong>
            <p>{props.statusText}</p>
            <div className="metric-actions">
              {!props.backendHealthy && isTauriDesktop() && <button className="primary-action" onClick={() => void props.onStartBackend()} disabled={props.startingBackend}>{props.startingBackend ? props.copy.home.startingBackend : props.copy.home.startBackend}</button>}
              {props.backendHealthy && <button className="secondary-action" onClick={() => void props.onRefresh()}>{props.copy.home.refresh}</button>}
              {props.backendHealthy && isTauriDesktop() && <button className="ghost-action" onClick={() => void props.onStopBackend()}>{props.copy.home.stopBackend}</button>}
            </div>
          </div>
        </section> : null}

        {activeTab === "subscriptions" ? <section className="control-section">
          <div className="control-section-title"><FontAwesomeIcon icon={faPalette} /> <span>{props.copy.settings.subscriptionSettings}</span></div>
          <p className="help-copy">{props.copy.settings.content}</p>
        </section> : null}

        {activeTab === "subscriptions" ? <section className="control-section">
          <div className="control-section-title"><span>{props.copy.settings.basic}</span></div>
          <label className="form-field"><span>{props.copy.settings.desktopPythonPath}</span><input value={props.config.desktop_python_path} onChange={(event) => set("desktop_python_path", event.target.value)} placeholder="C:\\Users\\you\\miniconda3\\envs\\ideer\\python.exe" /></label>
          <p className="help-copy">{props.copy.settings.desktopPythonHint}</p>
          <div className="form-grid three"><label className="form-field"><span>{props.copy.settings.provider}</span><input value={props.config.provider} onChange={(event) => set("provider", event.target.value)} /></label><label className="form-field"><span>{props.copy.settings.modelName}</span><input value={props.config.model} onChange={(event) => set("model", event.target.value)} /></label><label className="form-field"><span>{props.copy.settings.temperature}</span><input type="number" step="0.1" value={props.config.temperature} onChange={(event) => set("temperature", Number(event.target.value))} /></label></div>
          <div className="form-grid two"><label className="form-field"><span>{props.copy.settings.baseUrl}</span><input value={props.config.base_url} onChange={(event) => set("base_url", event.target.value)} /></label><label className="form-field"><span>{props.copy.settings.apiKey}</span><input value={props.config.api_key} onChange={(event) => set("api_key", event.target.value)} /></label></div>
          <p className="help-copy">{props.copy.settings.connectionHint}</p>
          <div className="test-connection-row">
            <button className="secondary-action" onClick={() => void props.onTestConnection()} disabled={props.testingConnection}>
              {props.testingConnection ? props.copy.settings.testingConnection : props.copy.settings.testConnection}
            </button>
            {props.connectionTestResult.kind !== "idle" ? <span className={props.connectionTestResult.kind === "success" ? "test-result success" : "test-result error"}>{props.connectionTestResult.message}</span> : null}
          </div>
        </section> : null}

        {activeTab === "mail" ? <section className="control-section">
          <div className="control-section-title">
            <span>{props.copy.settings.mailHostingSettings}</span>
            <span className="hint-badge" title={props.copy.settings.managedMailTooltip}><FontAwesomeIcon icon={faCircleQuestion} /></span>
          </div>
          <p className="help-copy">{props.copy.settings.managedMailHint}</p>
          <div className="form-grid three"><label className="form-field"><span>{props.copy.settings.smtpServer}</span><input value={props.config.smtp_server} onChange={(event) => set("smtp_server", event.target.value)} /></label><label className="form-field"><span>{props.copy.settings.smtpPort}</span><input type="number" value={props.config.smtp_port} onChange={(event) => set("smtp_port", Number(event.target.value))} /></label><label className="form-field"><span>{props.copy.settings.sender}</span><input value={props.config.sender} onChange={(event) => set("sender", event.target.value)} /></label></div>
          <div className="form-grid two"><label className="form-field"><span>{props.copy.settings.receiver}</span><input value={props.config.receiver} onChange={(event) => set("receiver", event.target.value)} /></label><label className="form-field"><span>{props.copy.settings.smtpPassword}</span><input type="password" value={props.config.smtp_password} onChange={(event) => set("smtp_password", event.target.value)} /></label></div>
          <p className="help-copy">{props.copy.settings.smtpConnectionHint}</p>
          <div className="test-connection-row">
            <button className="secondary-action" onClick={() => void props.onTestSmtpConnection()} disabled={props.testingSmtpConnection}>
              {props.testingSmtpConnection ? props.copy.settings.testingSmtp : props.copy.settings.testSmtp}
            </button>
            {props.smtpTestResult.kind !== "idle" ? <span className={props.smtpTestResult.kind === "success" ? "test-result success" : "test-result error"}>{props.smtpTestResult.message}</span> : null}
          </div>
        </section> : null}

        {activeTab === "info" ? <section className="control-section">
          <div className="control-section-title"><FontAwesomeIcon icon={faCircleInfo} /> <span>{props.copy.info.title}</span></div>
          <div className="info-simple">
            <img src={props.appIcon} alt={props.copy.appTitle} className="info-icon large" />
            <strong className="info-brand">iDeer</strong>
            <p className="info-slogan">{props.copy.info.slogan}</p>
            <p className="info-disclaimer">{props.copy.info.disclaimer}</p>
            {props.contributors.length > 0 ? <div className="info-authors">
              <strong className="info-authors-title">{props.copy.info.authors}</strong>
              <div className="info-author-list">
                {props.contributors.map((contributor) => (
                  <a
                    key={contributor.github_id}
                    className="info-author-card avatar-only"
                    href={resolveContributorGithubLink(contributor)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={props.copy.info.contributorGithubAria(contributor.name)}
                    onClick={(event) => {
                      event.preventDefault();
                      openExternalUrl(resolveContributorGithubLink(contributor));
                    }}
                  >
                    <img
                      src={getGitHubAvatarUrl(contributor.github_id)}
                      alt={contributor.name}
                      className="info-author-avatar"
                    />
                    <strong>{contributor.name}</strong>
                  </a>
                ))}
              </div>
            </div> : null}
            {props.githubUrl ? <a className="primary-action info-link centered" href={props.githubUrl} target="_blank" rel="noreferrer" onClick={(event) => { event.preventDefault(); openExternalUrl(props.githubUrl); }}><FontAwesomeIcon icon={faUpRightFromSquare} /> {props.copy.info.github}</a> : null}
          </div>
        </section> : null}

        {activeTab === "subscriptions" ? <section className="control-section">
          <details className="secondary-section">
            <summary>{props.copy.settings.advanced}</summary>
            <div className="secondary-section__body">
              <label className="form-field"><span>{props.copy.settings.description}</span><textarea rows={4} value={props.config.description} onChange={(event) => set("description", event.target.value)} /></label>
              <div className="form-grid three"><label className="form-field"><span>{props.copy.settings.ghLanguages}</span><input value={props.config.gh_languages} onChange={(event) => set("gh_languages", event.target.value)} /></label><label className="form-field"><span>{props.copy.settings.ghSince}</span><input value={props.config.gh_since} onChange={(event) => set("gh_since", event.target.value)} /></label><label className="form-field"><span>{props.copy.settings.ghMaxRepos}</span><input type="number" value={props.config.gh_max_repos} onChange={(event) => set("gh_max_repos", Number(event.target.value))} /></label></div>
              <div className="form-grid three"><label className="form-field"><span>{props.copy.settings.hfContentTypes}</span><input value={props.config.hf_content_types.join(" ")} onChange={(event) => set("hf_content_types", splitTokens(event.target.value))} /></label><label className="form-field"><span>{props.copy.settings.hfMaxPapers}</span><input type="number" value={props.config.hf_max_papers} onChange={(event) => set("hf_max_papers", Number(event.target.value))} /></label><label className="form-field"><span>{props.copy.settings.hfMaxModels}</span><input type="number" value={props.config.hf_max_models} onChange={(event) => set("hf_max_models", Number(event.target.value))} /></label></div>
              <div className="form-grid two"><label className="form-field"><span>{props.copy.settings.xRapidApiKey}</span><input value={props.config.x_rapidapi_key} onChange={(event) => set("x_rapidapi_key", event.target.value)} /></label><label className="form-field"><span>{props.copy.settings.xRapidApiHost}</span><input value={props.config.x_rapidapi_host} onChange={(event) => set("x_rapidapi_host", event.target.value)} /></label></div>
              <div className="form-grid three"><label className="form-field"><span>{props.copy.settings.arxivCategories}</span><input value={props.config.arxiv_categories} onChange={(event) => set("arxiv_categories", event.target.value)} /></label><label className="form-field"><span>{props.copy.settings.arxivMaxEntries}</span><input type="number" value={props.config.arxiv_max_entries} onChange={(event) => set("arxiv_max_entries", Number(event.target.value))} /></label><label className="form-field"><span>{props.copy.settings.arxivMaxPapers}</span><input type="number" value={props.config.arxiv_max_papers} onChange={(event) => set("arxiv_max_papers", Number(event.target.value))} /></label></div>
              <label className="form-field"><span>{props.copy.settings.researcherProfile}</span><textarea rows={6} value={props.config.researcher_profile} onChange={(event) => set("researcher_profile", event.target.value)} /></label>
              <label className="form-field"><span>{props.copy.settings.xAccounts}</span><textarea rows={6} value={props.config.x_accounts} onChange={(event) => set("x_accounts", event.target.value)} /></label>
            </div>
          </details>
          <div className="metric-actions">
            <button className="primary-action" onClick={() => void props.onSave()} disabled={props.savingConfig}>{props.savingConfig ? props.copy.settings.saving : props.copy.settings.save}</button>
          </div>
        </section> : null}

        {activeTab === "mail" ? <section className="control-section">
          <div className="metric-actions">
            <button className="primary-action" onClick={() => void props.onSave()} disabled={props.savingConfig}>{props.savingConfig ? props.copy.settings.saving : props.copy.settings.save}</button>
          </div>
        </section> : null}
      </aside>
  );

  if (props.detached) {
    return <div className="control-center-window">{panelBody}</div>;
  }

  return (
    <div className="control-center-overlay" onClick={props.onClose}>
      {panelBody}
    </div>
  );
}

export function SidebarButton(props: { icon: IconDefinition; label: string; active: boolean; onClick: () => void }) {
  return <button className={props.active ? "sidebar-button active" : "sidebar-button"} onClick={props.onClick}><span className="sidebar-icon"><FontAwesomeIcon icon={props.icon} /></span><strong>{props.label}</strong></button>;
}

export function HomeView(props: {
  backendHealthy: boolean; loadingData: boolean; errorText: string; statusText: string; config: ConfigData; copy: AppCopy;
  recentHistory: HistoryEntry[]; sources: SourceCard[]; comingSoonSources: ReadonlyArray<{ key: string; label: string }>; startingBackend: boolean; runForm: RunRequest; runState: RunState; logs: string[]; runFiles: string[]; historyLoading: boolean; runDisabledReason: string;
  onOpenSettings: () => void; onRefresh: () => Promise<void>; onRun: () => void; onRefreshHistory: () => Promise<void>;
  onStartBackend: () => Promise<void>; onStopBackend: () => Promise<void>; onOpenHistory: (entry: HistoryEntry) => Promise<void>;
  onToggleSource: (source: SourceName) => void; onChangeRunForm: <K extends keyof RunRequest>(key: K, value: RunRequest[K]) => void; onSaveInterestDescription: (value: string) => Promise<void>; savingInterestDescription: boolean;
}) {
  const [showComingSoonToast, setShowComingSoonToast] = useState(false);
  const sourceWiseSelected = props.runForm.delivery_mode === "source_emails";
  const combinedSelected = props.runForm.delivery_mode === "combined_report";
  const [positiveInput, setPositiveInput] = useState("");
  const [negativeInput, setNegativeInput] = useState("");
  const [interestTags, setInterestTags] = useState<InterestTags>(() => parseInterestDescription(props.runForm.description));
  const sourcePanelRef = useRef<HTMLElement | null>(null);
  const logsPanelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!showComingSoonToast) {
      return;
    }
    const timer = window.setTimeout(() => setShowComingSoonToast(false), 1400);
    return () => window.clearTimeout(timer);
  }, [showComingSoonToast]);

  useEffect(() => {
    setInterestTags(parseInterestDescription(props.runForm.description));
  }, [props.runForm.description]);

  useLayoutEffect(() => {
    const sourcePanel = sourcePanelRef.current;
    const logsPanel = logsPanelRef.current;
    if (!sourcePanel || !logsPanel) {
      return;
    }

    const syncHeight = () => {
      logsPanel.style.height = `${sourcePanel.offsetHeight}px`;
    };

    syncHeight();

    const observer = new ResizeObserver(() => {
      syncHeight();
    });

    observer.observe(sourcePanel);
    window.addEventListener("resize", syncHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncHeight);
      logsPanel.style.height = "";
    };
  }, [interestTags, props.errorText, props.loadingData, props.logs.length, props.recentHistory.length, props.runDisabledReason, props.runFiles.length]);

  function toggleDeliveryMode(target: "source" | "combined") {
    props.onChangeRunForm("delivery_mode", target === "source" ? "source_emails" : "combined_report");
  }

  function updateInterestTags(next: InterestTags) {
    const normalized = {
      positive: uniqueTags(next.positive),
      negative: uniqueTags(next.negative),
    };
    setInterestTags(normalized);
    props.onChangeRunForm("description", serializeInterestDescription(normalized));
  }

  function addTag(kind: keyof InterestTags) {
    const input = kind === "positive" ? positiveInput : negativeInput;
    const tokens = splitInterestLine(input);
    if (tokens.length === 0) {
      return;
    }
    updateInterestTags({
      ...interestTags,
      [kind]: [...interestTags[kind], ...tokens],
    });
    if (kind === "positive") {
      setPositiveInput("");
    } else {
      setNegativeInput("");
    }
  }

  function removeTag(kind: keyof InterestTags, tag: string) {
    updateInterestTags({
      ...interestTags,
      [kind]: interestTags[kind].filter((item) => item !== tag),
    });
  }

  return (
    <section className="page-grid">
      {props.errorText && <div className="notice error">{props.errorText}</div>}
      {props.runDisabledReason ? <div className="notice info">{props.runDisabledReason}</div> : null}
      {showComingSoonToast ? <div className="coming-soon-toast">{props.copy.home.comingSoonToast}</div> : null}

      <div className="home-grid top">
        <section ref={sourcePanelRef} className="content-panel">
          <div className="section-heading">
            <div>
              <h3>{props.copy.home.sources}</h3>
            </div>

            <div className="metric-actions home-action-row">
              {!props.backendHealthy && isTauriDesktop() ? (
                <button
                  className="secondary-action adaptive-button"
                  onClick={() => void props.onStartBackend()}
                  disabled={props.startingBackend}
                  title={props.startingBackend ? props.copy.home.startingBackend : props.copy.home.startBackend}
                  aria-label={props.startingBackend ? props.copy.home.startingBackend : props.copy.home.startBackend}
                >
                  <ControlButtonContent icon={faPlay} label={props.startingBackend ? props.copy.home.startingBackend : props.copy.home.startBackend} />
                </button>
              ) : null}

              {props.backendHealthy ? (
                <button
                  className="secondary-action adaptive-button"
                  onClick={() => void props.onRefresh()}
                  title={props.loadingData ? props.copy.home.refreshing : props.copy.home.refresh}
                  aria-label={props.loadingData ? props.copy.home.refreshing : props.copy.home.refresh}
                >
                  <ControlButtonContent icon={faRotate} label={props.loadingData ? props.copy.home.refreshing : props.copy.home.refresh} />
                </button>
              ) : null}

              {props.backendHealthy && isTauriDesktop() ? (
                <button
                  className="ghost-action adaptive-button"
                  onClick={() => void props.onStopBackend()}
                  title={props.copy.home.stopBackend}
                  aria-label={props.copy.home.stopBackend}
                >
                  <ControlButtonContent icon={faStop} label={props.copy.home.stopBackend} />
                </button>
              ) : null}

              <button
                className="primary-action adaptive-button"
                onClick={props.onRun}
                disabled={!props.backendHealthy || props.runState === "running" || props.runForm.sources.length === 0}
                title={props.runState === "running" ? props.copy.workbench.running : props.copy.workbench.run}
                aria-label={props.runState === "running" ? props.copy.workbench.running : props.copy.workbench.run}
              >
                <ControlButtonContent icon={faBolt} label={props.runState === "running" ? props.copy.workbench.running : props.copy.workbench.run} />
              </button>
            </div>
          </div>

          <div className="source-picker-grid">
            {props.sources.map((source) => (
              <label key={source.key} data-source={source.key} className={source.selected ? "source-picker-card active" : "source-picker-card"}>
                <input type="checkbox" checked={source.selected} onChange={() => props.onToggleSource(source.key)} />
                <img src={source.icon} alt={source.label} className="source-icon large" />
                <div>
                  <strong>{source.label}</strong>
                  <p>{source.description}</p>
                </div>
              </label>
            ))}

            {props.comingSoonSources.map((source) => (
              <button key={source.key} type="button" className="source-picker-card coming-soon clickable" onClick={() => setShowComingSoonToast(true)}>
                <div className="coming-soon-dot" />
                <div>
                  <strong>{source.label}</strong>
                  <p>{props.copy.home.comingSoon}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="form-grid two">
            <label className="form-field">
              <span>{props.copy.workbench.receiver}</span>
              <input value={props.runForm.receiver} onChange={(event) => props.onChangeRunForm("receiver", event.target.value)} />
            </label>

            <div className="form-field">
              <span>{props.copy.workbench.deliveryMode}</span>
              <div className="segmented-toggle-group delivery-mode-control">
                <button
                  type="button"
                  data-mode="source"
                  className={sourceWiseSelected ? "segmented-toggle-button adaptive-button active" : "segmented-toggle-button adaptive-button"}
                  onClick={() => toggleDeliveryMode("source")}
                  title={props.copy.workbench.sourceEmails}
                  aria-label={props.copy.workbench.sourceEmails}
                  aria-pressed={sourceWiseSelected}
                >
                  <ControlButtonContent icon={faInbox} label={props.copy.workbench.sourceEmails} />
                </button>
                <button
                  type="button"
                  data-mode="combined"
                  className={combinedSelected ? "segmented-toggle-button adaptive-button active" : "segmented-toggle-button adaptive-button"}
                  onClick={() => toggleDeliveryMode("combined")}
                  title={props.copy.workbench.combinedReport}
                  aria-label={props.copy.workbench.combinedReport}
                  aria-pressed={combinedSelected}
                >
                  <ControlButtonContent icon={faLayerGroup} label={props.copy.workbench.combinedReport} />
                </button>
              </div>
            </div>
          </div>

          <div className="feature-toggle-row">
            <button
              type="button"
              data-feature="report"
              className={props.runForm.generate_report ? "feature-toggle-button adaptive-button active" : "feature-toggle-button adaptive-button"}
              onClick={() => props.onChangeRunForm("generate_report", !props.runForm.generate_report)}
              title={props.copy.workbench.report}
              aria-label={props.copy.workbench.report}
              aria-pressed={props.runForm.generate_report}
            >
              <ControlButtonContent icon={faFileLines} label={props.copy.workbench.report} />
            </button>
            <button
              type="button"
              data-feature="ideas"
              className={props.runForm.generate_ideas ? "feature-toggle-button adaptive-button active" : "feature-toggle-button adaptive-button"}
              onClick={() => props.onChangeRunForm("generate_ideas", !props.runForm.generate_ideas)}
              title={props.copy.workbench.ideas}
              aria-label={props.copy.workbench.ideas}
              aria-pressed={props.runForm.generate_ideas}
            >
              <ControlButtonContent icon={faLightbulb} label={props.copy.workbench.ideas} />
            </button>
            <button
              type="button"
              data-feature="save"
              className={props.runForm.save ? "feature-toggle-button adaptive-button active" : "feature-toggle-button adaptive-button"}
              onClick={() => props.onChangeRunForm("save", !props.runForm.save)}
              title={props.copy.workbench.save}
              aria-label={props.copy.workbench.save}
              aria-pressed={props.runForm.save}
            >
              <ControlButtonContent icon={faFloppyDisk} label={props.copy.workbench.save} />
            </button>
          </div>

          <div className="form-field">
            <span>{props.copy.workbench.description}</span>
            <div className="interest-tag-editor">
              <div className="interest-tag-grid">
                <section className="interest-tag-panel positive">
                  <div className="interest-tag-header">
                    <strong>{props.copy.workbench.positiveTags}</strong>
                  </div>
                  <div className="interest-chip-list">
                    {interestTags.positive.length === 0 ? (
                      <span className="interest-chip empty">+</span>
                    ) : (
                      interestTags.positive.map((tag) => (
                        <button key={`pos-${tag}`} type="button" className="interest-chip positive" onClick={() => removeTag("positive", tag)}>
                          <span className="interest-chip-label">{tag}</span>
                          <FontAwesomeIcon icon={faXmark} />
                        </button>
                      ))
                    )}
                  </div>
                  <div className="interest-input-row">
                    <input
                      value={positiveInput}
                      placeholder={props.copy.workbench.positivePlaceholder}
                      onChange={(event) => setPositiveInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addTag("positive");
                        }
                      }}
                    />
                    <button type="button" className="secondary-action" onClick={() => addTag("positive")}>
                      {props.copy.workbench.addTag}
                    </button>
                  </div>
                </section>

                <section className="interest-tag-panel negative">
                  <div className="interest-tag-header">
                    <strong>{props.copy.workbench.negativeTags}</strong>
                  </div>
                  <div className="interest-chip-list">
                    {interestTags.negative.length === 0 ? (
                      <span className="interest-chip empty">-</span>
                    ) : (
                      interestTags.negative.map((tag) => (
                        <button key={`neg-${tag}`} type="button" className="interest-chip negative" onClick={() => removeTag("negative", tag)}>
                          <span className="interest-chip-label">{tag}</span>
                          <FontAwesomeIcon icon={faXmark} />
                        </button>
                      ))
                    )}
                  </div>
                  <div className="interest-input-row">
                    <input
                      value={negativeInput}
                      placeholder={props.copy.workbench.negativePlaceholder}
                      onChange={(event) => setNegativeInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addTag("negative");
                        }
                      }}
                    />
                    <button type="button" className="secondary-action" onClick={() => addTag("negative")}>
                      {props.copy.workbench.addTag}
                    </button>
                  </div>
                </section>
              </div>

              <div className="interest-save-row">
                <button type="button" className="secondary-action" onClick={() => void props.onSaveInterestDescription(serializeInterestDescription(interestTags))} disabled={props.savingInterestDescription}>
                  {props.savingInterestDescription ? props.copy.workbench.savingInterest : props.copy.workbench.saveInterest}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section ref={logsPanelRef} className="content-panel home-logs-panel">
          <div className="section-heading compact">
            <h3>{props.copy.workbench.logs}</h3>
            <span className={`run-badge ${props.runState}`}>{formatRunState(props.copy, props.runState)}</span>
          </div>
          <div className="terminal-panel">
            {props.logs.length === 0 ? <div className="empty-terminal">{props.copy.workbench.logEmpty}</div> : props.logs.map((line, index) => <div key={`${index}-${line}`}>{line}</div>)}
          </div>
        </section>
      </div>

      <div className="home-grid bottom">
        <section className="content-panel">
          <div className="section-heading">
            <div>
              <h3>{props.copy.home.recentRuns}</h3>
            </div>
          </div>
          {props.recentHistory.length === 0 ? (
            <div className="empty-state">{props.copy.home.noHistory}</div>
          ) : (
            <div className="history-compact-list">
              {props.recentHistory.map((entry) => (
                <button key={entry.id} className="history-compact-item" onClick={() => void props.onOpenHistory(entry)}>
                  <strong>{entry.type}</strong>
                  <span>{entry.date}</span>
                  <span>{props.copy.common.itemsCount(entry.items)}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="content-panel">
          <div className="section-heading compact">
            <h3>{props.copy.workbench.outputs}</h3>
            <button className="secondary-action" onClick={() => void props.onRefreshHistory()} disabled={props.historyLoading}>
              {props.historyLoading ? props.copy.library.refreshing : props.copy.workbench.refreshHistory}
            </button>
          </div>
          {props.runFiles.length === 0 ? (
            <div className="empty-state">{props.copy.workbench.outputEmpty}</div>
          ) : (
            <ul className="file-output-list">
              {props.runFiles.map((file) => <li key={file}>{file}</li>)}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}

export function WorkbenchView(props: {
  backendHealthy: boolean; runForm: RunRequest; runState: RunState; logs: string[]; runFiles: string[]; copy: AppCopy;
  sources: SourceCard[]; historyLoading: boolean; onRun: () => void; onRefreshHistory: () => Promise<void>;
  onToggleSource: (source: SourceName) => void; onChangeRunForm: <K extends keyof RunRequest>(key: K, value: RunRequest[K]) => void;
}) {
  return <section className="page-grid workbench-grid">
    <div className="content-panel workbench-main">
      <div className="section-heading"><div><h3>{props.copy.workbench.title}</h3></div><button className="primary-action" onClick={props.onRun} disabled={!props.backendHealthy || props.runState === "running" || props.runForm.sources.length === 0}>{props.runState === "running" ? props.copy.workbench.running : props.copy.workbench.run}</button></div>
      <div className="source-picker-grid">{props.sources.map((source) => <label key={source.key} data-source={source.key} className={source.selected ? "source-picker-card active" : "source-picker-card"}><input type="checkbox" checked={source.selected} onChange={() => props.onToggleSource(source.key)} /><img src={source.icon} alt={source.label} className="source-icon large" /><div><strong>{source.label}</strong><p>{source.description}</p></div></label>)}</div>
      <div className="form-grid two"><label className="form-field"><span>{props.copy.workbench.receiver}</span><input value={props.runForm.receiver} onChange={(event) => props.onChangeRunForm("receiver", event.target.value)} /></label><label className="form-field"><span>{props.copy.workbench.deliveryMode}</span><select value={props.runForm.delivery_mode} onChange={(event) => props.onChangeRunForm("delivery_mode", event.target.value as RunRequest["delivery_mode"])}><option value="source_emails">{props.copy.workbench.sourceEmails}</option><option value="combined_report">{props.copy.workbench.combinedReport}</option><option value="both">{props.copy.workbench.both}</option></select></label></div>
      <div className="toggle-row"><label><input type="checkbox" checked={props.runForm.generate_report} onChange={(event) => props.onChangeRunForm("generate_report", event.target.checked)} /> {props.copy.workbench.report}</label><label><input type="checkbox" checked={props.runForm.generate_ideas} onChange={(event) => props.onChangeRunForm("generate_ideas", event.target.checked)} /> {props.copy.workbench.ideas}</label><label><input type="checkbox" checked={props.runForm.save} onChange={(event) => props.onChangeRunForm("save", event.target.checked)} /> {props.copy.workbench.save}</label></div>
      <label className="form-field"><span>{props.copy.workbench.description}</span><textarea rows={5} value={props.runForm.description} onChange={(event) => props.onChangeRunForm("description", event.target.value)} /></label>
      <details className="secondary-section">
        <summary>{props.copy.workbench.advanced}</summary>
        <div className="secondary-section__body">
          <div className="form-grid two"><label className="form-field"><span>{props.copy.workbench.scholarUrl}</span><input value={props.runForm.scholar_url} onChange={(event) => props.onChangeRunForm("scholar_url", event.target.value)} /></label><label className="form-field"><span>{props.copy.workbench.extraX}</span><textarea rows={4} value={props.runForm.x_accounts_input} onChange={(event) => props.onChangeRunForm("x_accounts_input", event.target.value)} /></label></div>
          <label className="form-field"><span>{props.copy.workbench.researcherProfile}</span><textarea rows={8} value={props.runForm.researcher_profile} onChange={(event) => props.onChangeRunForm("researcher_profile", event.target.value)} /></label>
        </div>
      </details>
    </div>
    <div className="side-stack">
      <section className="content-panel"><div className="section-heading compact"><h3>{props.copy.workbench.logs}</h3><span className={`run-badge ${props.runState}`}>{formatRunState(props.copy, props.runState)}</span></div><div className="terminal-panel">{props.logs.length === 0 ? <div className="empty-terminal">{props.copy.workbench.logEmpty}</div> : props.logs.map((line, index) => <div key={`${index}-${line}`}>{line}</div>)}</div></section>
      <section className="content-panel"><div className="section-heading compact"><h3>{props.copy.workbench.outputs}</h3><button className="secondary-action" onClick={() => void props.onRefreshHistory()} disabled={props.historyLoading}>{props.historyLoading ? props.copy.library.refreshing : props.copy.workbench.refreshHistory}</button></div>{props.runFiles.length === 0 ? <div className="empty-state">{props.copy.workbench.outputEmpty}</div> : <ul className="file-output-list">{props.runFiles.map((file) => <li key={file}>{file}</li>)}</ul>}</section>
    </div>
  </section>;
}

export function LibraryView(props: { backendHealthy: boolean; history: HistoryEntry[]; selectedResult: ResultSet | null; historyLoading: boolean; onRefresh: () => Promise<void>; onSelect: (entry: HistoryEntry) => Promise<void>; copy: AppCopy }) {
  return <section className="page-grid library-grid">
    <div className="content-panel"><div className="section-heading"><div><h3>{props.copy.library.title}</h3></div><button className="secondary-action" onClick={() => void props.onRefresh()} disabled={!props.backendHealthy || props.historyLoading}>{props.historyLoading ? props.copy.library.refreshing : props.copy.library.refresh}</button></div>{props.history.length === 0 ? <div className="empty-state">{props.copy.library.empty}</div> : <div className="history-list">{props.history.map((entry) => <button key={entry.id} className="history-card" onClick={() => void props.onSelect(entry)}><div><strong>{entry.type}</strong><p>{entry.path}</p></div><div className="history-meta"><span>{entry.date}</span><span>{props.copy.common.itemsCount(entry.items)}</span></div></button>)}</div>}</div>
    <div className="content-panel"><div className="section-heading compact"><h3>{props.copy.library.details}</h3></div>{!props.selectedResult ? <div className="empty-state">{props.copy.library.emptyDetails}</div> : <div className="result-stack"><div className="result-head"><strong>{props.selectedResult.source}</strong><span>{props.selectedResult.date}</span></div><ResultSection title="Markdown">{props.selectedResult.markdown_files.length === 0 ? <div className="empty-state small">{props.copy.library.noMarkdown}</div> : props.selectedResult.markdown_files.map((file) => <details key={file.name} open><summary>{file.name}</summary><pre>{file.content}</pre></details>)}</ResultSection><ResultSection title="HTML">{props.selectedResult.html_files.length === 0 ? <div className="empty-state small">{props.copy.library.noHtml}</div> : <ul className="file-output-list">{props.selectedResult.html_files.map((file) => <li key={file.name}><a href={file.url} target="_blank" rel="noreferrer">{file.name}</a></li>)}</ul>}</ResultSection><ResultSection title="JSON">{props.selectedResult.json_files.length === 0 ? <div className="empty-state small">{props.copy.library.noJson}</div> : props.selectedResult.json_files.map((file) => <details key={file.name}><summary>{file.name}</summary><pre>{JSON.stringify(file.data, null, 2)}</pre></details>)}</ResultSection></div>}</div>
  </section>;
}

export function SettingsView(props: { backendHealthy: boolean; config: ConfigData; savingConfig: boolean; onChange: (value: ConfigData) => void; onSave: () => Promise<void>; copy: AppCopy; languagePreference: LanguagePreference; themePreference: ThemePreference; onChangeLanguage: (value: LanguagePreference) => void; onChangeTheme: (value: ThemePreference) => void }) {
  const set = <K extends keyof ConfigData,>(key: K, value: ConfigData[K]) => props.onChange({ ...props.config, [key]: value });
  return <section className="page-grid settings-grid">
    <div className="content-panel"><div className="section-heading"><div><h3>{props.copy.settings.basic}</h3></div><button className="primary-action" onClick={() => void props.onSave()} disabled={!props.backendHealthy || props.savingConfig}>{props.savingConfig ? props.copy.settings.saving : props.copy.settings.save}</button></div>
      <div className="preferences-grid">
        <label className="form-field"><span>{props.copy.settings.language}</span><select value={props.languagePreference} onChange={(event) => props.onChangeLanguage(event.target.value as LanguagePreference)}><option value="system">{props.copy.settings.followSystem}</option><option value="zh">{props.copy.settings.chinese}</option><option value="en">{props.copy.settings.english}</option></select></label>
        <label className="form-field"><span>{props.copy.settings.theme}</span><select value={props.themePreference} onChange={(event) => props.onChangeTheme(event.target.value as ThemePreference)}><option value="system">{props.copy.settings.followSystem}</option><option value="light">{props.copy.settings.light}</option><option value="dark">{props.copy.settings.dark}</option></select></label>
      </div>
      <div className="form-grid three"><label className="form-field"><span>{props.copy.settings.provider}</span><input value={props.config.provider} onChange={(event) => set("provider", event.target.value)} /></label><label className="form-field"><span>{props.copy.settings.modelName}</span><input value={props.config.model} onChange={(event) => set("model", event.target.value)} /></label><label className="form-field"><span>{props.copy.settings.temperature}</span><input type="number" step="0.1" value={props.config.temperature} onChange={(event) => set("temperature", Number(event.target.value))} /></label></div>
      <div className="form-grid two"><label className="form-field"><span>{props.copy.settings.baseUrl}</span><input value={props.config.base_url} onChange={(event) => set("base_url", event.target.value)} /></label><label className="form-field"><span>{props.copy.settings.apiKey}</span><input value={props.config.api_key} onChange={(event) => set("api_key", event.target.value)} /></label></div>
      <div className="form-grid three"><label className="form-field"><span>{props.copy.settings.smtpServer}</span><input value={props.config.smtp_server} onChange={(event) => set("smtp_server", event.target.value)} /></label><label className="form-field"><span>{props.copy.settings.smtpPort}</span><input type="number" value={props.config.smtp_port} onChange={(event) => set("smtp_port", Number(event.target.value))} /></label><label className="form-field"><span>{props.copy.settings.sender}</span><input value={props.config.sender} onChange={(event) => set("sender", event.target.value)} /></label></div>
      <div className="form-grid two"><label className="form-field"><span>{props.copy.settings.receiver}</span><input value={props.config.receiver} onChange={(event) => set("receiver", event.target.value)} /></label><label className="form-field"><span>{props.copy.settings.smtpPassword}</span><input type="password" value={props.config.smtp_password} onChange={(event) => set("smtp_password", event.target.value)} /></label></div>
    </div>
    <div className="content-panel"><div className="section-heading compact"><h3>{props.copy.settings.content}</h3></div>
      <label className="form-field"><span>{props.copy.settings.description}</span><textarea rows={5} value={props.config.description} onChange={(event) => set("description", event.target.value)} /></label>
      <details className="secondary-section">
        <summary>{props.copy.settings.advanced}</summary>
        <div className="secondary-section__body">
          <div className="form-grid three"><label className="form-field"><span>{props.copy.settings.ghLanguages}</span><input value={props.config.gh_languages} onChange={(event) => set("gh_languages", event.target.value)} /></label><label className="form-field"><span>{props.copy.settings.ghSince}</span><input value={props.config.gh_since} onChange={(event) => set("gh_since", event.target.value)} /></label><label className="form-field"><span>{props.copy.settings.ghMaxRepos}</span><input type="number" value={props.config.gh_max_repos} onChange={(event) => set("gh_max_repos", Number(event.target.value))} /></label></div>
          <div className="form-grid three"><label className="form-field"><span>{props.copy.settings.hfContentTypes}</span><input value={props.config.hf_content_types.join(" ")} onChange={(event) => set("hf_content_types", splitTokens(event.target.value))} /></label><label className="form-field"><span>{props.copy.settings.hfMaxPapers}</span><input type="number" value={props.config.hf_max_papers} onChange={(event) => set("hf_max_papers", Number(event.target.value))} /></label><label className="form-field"><span>{props.copy.settings.hfMaxModels}</span><input type="number" value={props.config.hf_max_models} onChange={(event) => set("hf_max_models", Number(event.target.value))} /></label></div>
          <div className="form-grid two"><label className="form-field"><span>{props.copy.settings.xRapidApiKey}</span><input value={props.config.x_rapidapi_key} onChange={(event) => set("x_rapidapi_key", event.target.value)} /></label><label className="form-field"><span>{props.copy.settings.xRapidApiHost}</span><input value={props.config.x_rapidapi_host} onChange={(event) => set("x_rapidapi_host", event.target.value)} /></label></div>
          <div className="form-grid three"><label className="form-field"><span>{props.copy.settings.arxivCategories}</span><input value={props.config.arxiv_categories} onChange={(event) => set("arxiv_categories", event.target.value)} /></label><label className="form-field"><span>{props.copy.settings.arxivMaxEntries}</span><input type="number" value={props.config.arxiv_max_entries} onChange={(event) => set("arxiv_max_entries", Number(event.target.value))} /></label><label className="form-field"><span>{props.copy.settings.arxivMaxPapers}</span><input type="number" value={props.config.arxiv_max_papers} onChange={(event) => set("arxiv_max_papers", Number(event.target.value))} /></label></div>
          <label className="form-field"><span>{props.copy.settings.researcherProfile}</span><textarea rows={8} value={props.config.researcher_profile} onChange={(event) => set("researcher_profile", event.target.value)} /></label>
          <label className="form-field"><span>{props.copy.settings.xAccounts}</span><textarea rows={8} value={props.config.x_accounts} onChange={(event) => set("x_accounts", event.target.value)} /></label>
        </div>
      </details>
    </div>
  </section>;
}

function ResultSection(props: { title: string; children: ReactNode }) {
  return <section className="result-section"><h4>{props.title}</h4>{props.children}</section>;
}

function splitTokens(value: string) {
  return value.split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

function getGitHubAvatarUrl(githubId: string) {
  return `https://github.com/${githubId}.png?size=160`;
}

function resolveContributorGithubLink(contributor: MainContributor) {
  return `https://github.com/${contributor.github_id}`;
}

function formatRunState(copy: AppCopy, runState: RunState) {
  return copy.workbench.runStates[runState];
}
