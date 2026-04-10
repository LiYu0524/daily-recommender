import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faBolt,
  faCircleInfo,
  faCircleQuestion,
  faCompress,
  faCube,
  faEye,
  faEyeSlash,
  faEnvelope,
  faFileLines,
  faFireFlameCurved,
  faFloppyDisk,
  faGear,
  faKey,
  faLightbulb,
  faLink,
  faMinus,
  faPen,
  faRotate,
  faSquare,
  faUpRightFromSquare,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import type { AppCopy, LanguagePreference, ThemePreference } from "./copy";
import { getRunOutputKey, renderRunOutputLabel } from "./runOutputs";
import type { AvatarId, ConfigData, HistoryEntry, MainContributor, ResultSet, RunOutputFile, RunRequest, ServiceMode, SourceName, UserProfile, VisibleSourceKey } from "./types";
import { closeWindow, isTauriDesktop, isWindowMaximized, minimizeWindow, openExternalUrl, toggleWindowMaximize } from "./desktop";

type RunState = "idle" | "running" | "done" | "error";
type SourceCard = { key: SourceName; label: string; description: string; icon: string; selected: boolean };
type InterestTags = { positive: string[]; negative: string[] };
type SourceSettingsKey = SourceName;

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

const VISIBLE_SOURCE_OPTIONS = [
  { key: "github", type: "ready" },
  { key: "huggingface", type: "ready" },
  { key: "twitter", type: "ready" },
  { key: "arxiv", type: "ready" },
  { key: "wos", type: "comingSoon" },
  { key: "cnki", type: "comingSoon" },
  { key: "wechat", type: "comingSoon" },
  { key: "scholar", type: "comingSoon" },
] as const satisfies ReadonlyArray<{ key: VisibleSourceKey; type: "ready" | "comingSoon" }>;

const VISIBLE_SOURCE_LABELS: Record<SourceName, string> = {
  github: "GitHub",
  huggingface: "HuggingFace",
  twitter: "X",
  arxiv: "arXiv",
};

function sourceSettingsAvailable(key: VisibleSourceKey): key is SourceSettingsKey {
  return key === "github" || key === "huggingface" || key === "twitter" || key === "arxiv";
}

const WELCOME_DIRECTION_GROUPS = [
  { title: "AI & Computing", tone: "teal", tags: ["LLM Agents", "AI Safety", "Human-Computer Interaction", "Computer Vision", "Robotics"] },
  { title: "Life Sciences", tone: "green", tags: ["Bioinformatics", "Genomics", "Neuroscience", "Drug Discovery", "Precision Medicine"] },
  { title: "Health & Society", tone: "rose", tags: ["Public Health", "Mental Health", "Health Policy", "Science Communication", "Aging"] },
  { title: "Education & Humanities", tone: "amber", tags: ["Education Technology", "Digital Humanities", "Language Learning", "Cultural Studies", "Media Studies"] },
  { title: "Business & Policy", tone: "blue", tags: ["FinTech", "Climate Policy", "Innovation Management", "Behavioral Economics", "Computational Social Science"] },
] as const;

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

function RadioChoiceGroup<T extends string>(props: {
  name: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  columns?: 2 | 3;
}) {
  return (
    <div className={`radio-choice-group cols-${props.columns ?? 3}`}>
      {props.options.map((option) => (
        <label key={option.value} className={props.value === option.value ? "radio-choice-option active" : "radio-choice-option"}>
          <input type="radio" name={props.name} checked={props.value === option.value} onChange={() => props.onChange(option.value)} />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

function FieldControl(props: {
  icon: IconDefinition;
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <label className="field-control">
      <span className="field-meta">
        <span className="field-label-row">
          <span className="field-label-icon" aria-hidden="true">
            <FontAwesomeIcon icon={props.icon} />
          </span>
          <span className="field-label-text">{props.label}</span>
          {props.help ? <span className="field-help inline">{props.help}</span> : null}
        </span>
      </span>
      <span className="field-input-slot">{props.children}</span>
    </label>
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
  initialTab?: "profile" | "preferences" | "sources" | "model" | "mail" | "info";
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
  deliveryModePreference: RunRequest["delivery_mode"];
  onSave: () => Promise<void>;
  onTestConnection: () => Promise<void>;
  onTestSmtpConnection: () => Promise<void>;
  onSaveProfile: () => Promise<void>;
  onStartBackend: () => Promise<void>;
  onStopBackend: () => Promise<void>;
  onRefresh: () => Promise<void>;
  copy: AppCopy;
  appIcon: string;
  version: string;
  releaseDate: string;
  githubUrl: string;
  contributors: MainContributor[];
  fallbackContributorAvatar: string;
  languagePreference: LanguagePreference;
  themePreference: ThemePreference;
  onChangeLanguage: (value: LanguagePreference) => void;
  onChangeTheme: (value: ThemePreference) => void;
  onChangeDeliveryMode: (value: RunRequest["delivery_mode"]) => void;
}) {
  const set = <K extends keyof ConfigData,>(key: K, value: ConfigData[K]) => props.onChangeConfig({ ...props.config, [key]: value });
  const setProfile = <K extends keyof UserProfile,>(key: K, value: UserProfile[K]) => props.onChangeUserProfile({ ...props.userProfile, [key]: value });
  const toggleVisibleSource = (key: VisibleSourceKey) => {
    const next = props.config.visible_sources.includes(key)
      ? props.config.visible_sources.filter((item) => item !== key)
      : [...props.config.visible_sources, key];
    set("visible_sources", next as ConfigData["visible_sources"]);
  };
  const [activeTab, setActiveTab] = useState<"profile" | "preferences" | "sources" | "model" | "mail" | "info">(props.initialTab ?? "profile");
  const [activeSourceSettings, setActiveSourceSettings] = useState<SourceSettingsKey | null>("github");
  const [modelApiKeyVisible, setModelApiKeyVisible] = useState(false);
  const [smtpPasswordVisible, setSmtpPasswordVisible] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [profileTags, setProfileTags] = useState<InterestTags>(() => parseInterestDescription(props.userProfile.focus));
  const [activeProfileTagKind, setActiveProfileTagKind] = useState<keyof InterestTags | null>(null);
  const [profileTagInput, setProfileTagInput] = useState("");
  const avatarPickerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setActiveTab(props.initialTab ?? "profile");
  }, [props.initialTab]);
  useEffect(() => {
    if (props.config.provider !== "openai") {
      set("provider", "openai");
    }
  }, [props.config.provider]);
  useEffect(() => {
    setProfileTags(parseInterestDescription(props.userProfile.focus));
  }, [props.userProfile.focus]);
  useEffect(() => {
    if (!avatarPickerOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (avatarPickerRef.current && !avatarPickerRef.current.contains(event.target as Node)) {
        setAvatarPickerOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [avatarPickerOpen]);
  if (props.panel === "none") return null;
  const contextualHelp = activeTab === "sources"
    ? props.copy.settings.sourceSubscriptionHelp
    : activeTab === "model"
      ? props.copy.settings.modelServiceHelp
    : activeTab === "mail"
      ? props.copy.settings.mailHelp
      : "";
  const visiblePositiveTags = profileTags.positive.slice(0, 4);
  const hiddenPositiveCount = Math.max(0, profileTags.positive.length - visiblePositiveTags.length);

  function updateProfileTags(next: InterestTags) {
    const normalized = {
      positive: uniqueTags(next.positive),
      negative: uniqueTags(next.negative),
    };
    setProfileTags(normalized);
    setProfile("focus", serializeInterestDescription(normalized));
  }

  function commitProfileTags(kind: keyof InterestTags) {
    const tokens = splitInterestLine(profileTagInput);
    if (tokens.length > 0) {
      updateProfileTags({
        ...profileTags,
        [kind]: [...profileTags[kind], ...tokens],
      });
    }
    setProfileTagInput("");
    setActiveProfileTagKind(null);
  }

  function removeProfileTag(kind: keyof InterestTags, tag: string) {
    updateProfileTags({
      ...profileTags,
      [kind]: profileTags[kind].filter((item) => item !== tag),
    });
  }

  const panelBody = (
    <aside className={props.detached ? "control-center-panel detached" : "control-center-panel"} onClick={(event) => event.stopPropagation()}>
        <div className="control-tabs-shell">
          <div className="control-tabs">
            <button className={activeTab === "profile" ? "control-tab active" : "control-tab"} onClick={() => setActiveTab("profile")}>{props.copy.settings.profile}</button>
            <button className={activeTab === "preferences" ? "control-tab active" : "control-tab"} onClick={() => setActiveTab("preferences")}>{props.copy.settings.preferences}</button>
            <button className={activeTab === "sources" ? "control-tab active" : "control-tab"} onClick={() => setActiveTab("sources")}>{props.copy.settings.sourceSubscriptions}</button>
            <button className={activeTab === "model" ? "control-tab active" : "control-tab"} onClick={() => setActiveTab("model")}>{props.copy.settings.modelService}</button>
            <button className={activeTab === "mail" ? "control-tab active" : "control-tab"} onClick={() => setActiveTab("mail")}>{props.copy.settings.mailHostingSettings}</button>
            <button className={activeTab === "info" ? "control-tab active" : "control-tab"} onClick={() => setActiveTab("info")}>{props.copy.info.title}</button>
          </div>
          {!props.detached ? <div className="control-panel-toolbar">
            {contextualHelp ? <div className="control-panel-help-anchor">
              <button className="control-panel-help" aria-label={props.copy.settings.help} type="button">
                <FontAwesomeIcon icon={faCircleQuestion} />
              </button>
              <div className="control-panel-tooltip">{contextualHelp}</div>
            </div> : null}
            <button className="control-panel-close" onClick={props.onClose} aria-label="Close" type="button"><FontAwesomeIcon icon={faXmark} /></button>
          </div> : null}
        </div>

        {activeTab === "profile" ? <section className="control-section">
          <div className="profile-card profile-card-editable">
            <div className="profile-avatar-stack">
              <div className="profile-avatar-picker" ref={avatarPickerRef}>
                <button type="button" className="profile-avatar-trigger" onClick={() => setAvatarPickerOpen((value) => !value)}>
                  <img src={props.avatars.find((item) => item.key === props.userProfile.avatar)?.src} alt={props.userProfile.name || props.copy.user.fallbackName} className="profile-avatar-large" />
                </button>
                {avatarPickerOpen ? (
                  <div className="avatar-picker-popover">
                    {props.avatars.map((avatar) => (
                      <button
                        key={avatar.key}
                        type="button"
                        className={props.userProfile.avatar === avatar.key ? "avatar-choice active" : "avatar-choice"}
                        onClick={() => {
                          setProfile("avatar", avatar.key);
                          setAvatarPickerOpen(false);
                        }}
                      >
                        <img src={avatar.src} alt={avatar.key} className="avatar-choice-image" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="profile-copy">
              {editingName ? (
                <input
                  className="profile-name-inline"
                  value={props.userProfile.name}
                  autoFocus
                  placeholder={props.copy.user.fallbackName}
                  onChange={(event) => setProfile("name", event.target.value)}
                  onBlur={() => setEditingName(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === "Escape") {
                      setEditingName(false);
                    }
                  }}
                />
              ) : (
                <div className="profile-name-row">
                  <strong>{props.userProfile.name || props.copy.user.fallbackName}</strong>
                  <button type="button" className="profile-name-edit-button" onClick={() => setEditingName(true)} aria-label="Edit name">
                    <FontAwesomeIcon icon={faPen} />
                  </button>
                </div>
              )}
              <div className="profile-preview-tags">
                {visiblePositiveTags.map((tag) => (
                  <span key={`preview-${tag}`} className="profile-preview-pill">{tag}</span>
                ))}
                {hiddenPositiveCount > 0 ? <span className="profile-preview-pill muted">{`+${hiddenPositiveCount}`}</span> : null}
              </div>
            </div>
          </div>

          <FieldControl icon={faEnvelope} label={props.copy.settings.userReceiver}>
            <input value={props.userProfile.receiver} onChange={(event) => setProfile("receiver", event.target.value)} />
          </FieldControl>
          <FieldControl icon={faFileLines} label={props.copy.settings.userFocus}>
            <div className="profile-interest-editor">
              <ProfileTagBucket
                tone="positive"
                label={props.copy.workbench.positiveTags}
                tags={profileTags.positive}
                active={activeProfileTagKind === "positive"}
                inputValue={profileTagInput}
                onStartAdd={() => {
                  setActiveProfileTagKind("positive");
                  setProfileTagInput("");
                }}
                onInputChange={setProfileTagInput}
                onCommit={() => commitProfileTags("positive")}
                onCancel={() => {
                  setActiveProfileTagKind(null);
                  setProfileTagInput("");
                }}
                onRemove={(tag) => removeProfileTag("positive", tag)}
              />
              <ProfileTagBucket
                tone="negative"
                label={props.copy.workbench.negativeTags}
                tags={profileTags.negative}
                active={activeProfileTagKind === "negative"}
                inputValue={profileTagInput}
                onStartAdd={() => {
                  setActiveProfileTagKind("negative");
                  setProfileTagInput("");
                }}
                onInputChange={setProfileTagInput}
                onCommit={() => commitProfileTags("negative")}
                onCancel={() => {
                  setActiveProfileTagKind(null);
                  setProfileTagInput("");
                }}
                onRemove={(tag) => removeProfileTag("negative", tag)}
              />
            </div>
          </FieldControl>
          <FieldControl icon={faCircleInfo} label={props.copy.settings.userSelfProfile}>
            <textarea rows={4} value={props.config.user_researcher_profile} placeholder={props.copy.settings.userSelfProfilePlaceholder} onChange={(event) => set("user_researcher_profile", event.target.value)} />
          </FieldControl>
          <div className="metric-actions centered-actions">
            <button className="primary-action" onClick={() => void props.onSaveProfile()} disabled={props.savingProfile}>{props.savingProfile ? props.copy.settings.saving : props.copy.settings.saveProfile}</button>
          </div>
        </section> : null}

        {activeTab === "preferences" ? <section className="control-section">
          <div className="form-field">
            <span>{props.copy.settings.theme}</span>
            <RadioChoiceGroup
              name="settings-theme"
              value={props.themePreference}
              columns={3}
              onChange={(value) => props.onChangeTheme(value as ThemePreference)}
              options={[
                { value: "system", label: props.copy.settings.followSystem },
                { value: "light", label: props.copy.settings.light },
                { value: "dark", label: props.copy.settings.dark },
              ]}
            />
          </div>
          <div className="form-field">
            <span>{props.copy.settings.language}</span>
            <RadioChoiceGroup
              name="settings-language"
              value={props.languagePreference}
              columns={3}
              onChange={(value) => props.onChangeLanguage(value as LanguagePreference)}
              options={[
                { value: "system", label: props.copy.settings.followSystem },
                { value: "zh", label: props.copy.settings.chinese },
                { value: "en", label: props.copy.settings.english },
              ]}
            />
          </div>
          <div className="form-field">
            <span>{props.copy.settings.defaultDeliveryMode}</span>
            <RadioChoiceGroup
              name="settings-delivery-mode"
              value={props.deliveryModePreference}
              columns={3}
              onChange={(value) => props.onChangeDeliveryMode(value as RunRequest["delivery_mode"])}
              options={[
                { value: "source_emails", label: props.copy.workbench.sourceEmails },
                { value: "combined_report", label: props.copy.workbench.combinedReport },
                { value: "both", label: props.copy.workbench.both },
              ]}
            />
          </div>
          <div className="form-field">
            <span>{props.copy.settings.logLevel}</span>
            <RadioChoiceGroup
              name="settings-log-level"
              value={props.config.log_level}
              columns={3}
              onChange={(value) => set("log_level", value as ConfigData["log_level"])}
              options={[
                { value: "progress", label: props.copy.settings.logLevelProgress },
                { value: "standard", label: props.copy.settings.logLevelStandard },
                { value: "verbose", label: props.copy.settings.logLevelVerbose },
              ]}
            />
          </div>
          <details className="secondary-section">
            <summary>{props.copy.settings.advanced}</summary>
            <div className="secondary-section__body">
              <FieldControl icon={faGear} label={props.copy.settings.desktopPythonPath} help={props.copy.settings.desktopPythonHint}>
                <input value={props.config.desktop_python_path} onChange={(event) => set("desktop_python_path", event.target.value)} placeholder="C:\\Users\\you\\miniconda3\\envs\\ideer\\python.exe" />
              </FieldControl>
              <div className="control-section-title compact">
                <FontAwesomeIcon icon={faRotate} />
                <span>{props.copy.home.backend}</span>
              </div>
              <div className="control-status-card">
                <strong>{props.backendHealthy ? props.copy.info.online : props.copy.info.offline}</strong>
                <p>{props.statusText}</p>
                <div className="metric-actions">
                  {!props.backendHealthy && isTauriDesktop() ? <button className="primary-action" onClick={() => void props.onStartBackend()} disabled={props.startingBackend}>{props.startingBackend ? props.copy.home.startingBackend : props.copy.home.startBackend}</button> : null}
                  {props.backendHealthy ? <button className="secondary-action" onClick={() => void props.onRefresh()}>{props.copy.home.refresh}</button> : null}
                  {props.backendHealthy && isTauriDesktop() ? <button className="ghost-action" onClick={() => void props.onStopBackend()}>{props.copy.home.stopBackend}</button> : null}
                </div>
              </div>
            </div>
          </details>
        </section> : null}

        {activeTab === "sources" ? <section className="control-section">
          <div className="form-field">
            <span>{props.copy.settings.visibleSources}</span>
            <p className="help-copy">{props.copy.settings.visibleSourcesHint}</p>
            <div className="visible-source-grid">
              {VISIBLE_SOURCE_OPTIONS.map((source) => {
                const label = source.type === "ready" ? VISIBLE_SOURCE_LABELS[source.key as SourceName] : props.copy.comingSoonSources[source.key];
                const hasDetails = sourceSettingsAvailable(source.key);
                const detailKey = hasDetails ? source.key : null;
                const expanded = detailKey !== null && activeSourceSettings === detailKey;
                return (
                  <div key={source.key} className={`visible-source-option ${expanded ? "expanded" : ""}`}>
                    <label className="visible-source-option__toggle">
                      <input type="checkbox" checked={props.config.visible_sources.includes(source.key)} onChange={() => toggleVisibleSource(source.key)} />
                      <span>{label}</span>
                    </label>
                    {hasDetails ? (
                      <button
                        type="button"
                        className="visible-source-option__action"
                        onClick={() => setActiveSourceSettings((current) => current === detailKey ? null : detailKey)}
                      >
                        {expanded ? props.copy.settings.hideSourceDetails : props.copy.settings.showSourceDetails}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          {activeSourceSettings ? (
            <section className="source-detail-panel">
              <div className="source-detail-panel__header">
                <strong>{props.copy.settings.sourceDetailTitle(VISIBLE_SOURCE_LABELS[activeSourceSettings])}</strong>
                <p>{props.copy.settings.sourceDetailHint}</p>
              </div>

              {activeSourceSettings === "github" ? (
                <div className="form-grid settings-field-grid">
                  <FieldControl icon={faGear} label={props.copy.settings.ghLanguages}>
                    <input value={props.config.gh_languages} onChange={(event) => set("gh_languages", event.target.value)} />
                  </FieldControl>
                  <FieldControl icon={faRotate} label={props.copy.settings.ghSince}>
                    <input value={props.config.gh_since} onChange={(event) => set("gh_since", event.target.value)} />
                  </FieldControl>
                  <FieldControl icon={faCube} label={props.copy.settings.ghMaxRepos}>
                    <input type="number" value={props.config.gh_max_repos} onChange={(event) => set("gh_max_repos", Number(event.target.value))} />
                  </FieldControl>
                </div>
              ) : null}

              {activeSourceSettings === "huggingface" ? (
                <div className="form-grid settings-field-grid">
                  <FieldControl icon={faFileLines} label={props.copy.settings.hfContentTypes}>
                    <input value={props.config.hf_content_types.join(" ")} onChange={(event) => set("hf_content_types", splitTokens(event.target.value))} />
                  </FieldControl>
                  <FieldControl icon={faCube} label={props.copy.settings.hfMaxPapers}>
                    <input type="number" value={props.config.hf_max_papers} onChange={(event) => set("hf_max_papers", Number(event.target.value))} />
                  </FieldControl>
                  <FieldControl icon={faCube} label={props.copy.settings.hfMaxModels}>
                    <input type="number" value={props.config.hf_max_models} onChange={(event) => set("hf_max_models", Number(event.target.value))} />
                  </FieldControl>
                </div>
              ) : null}

              {activeSourceSettings === "arxiv" ? (
                <div className="form-grid settings-field-grid">
                  <FieldControl icon={faFileLines} label={props.copy.settings.arxivCategories}>
                    <input value={props.config.arxiv_categories} onChange={(event) => set("arxiv_categories", event.target.value)} />
                  </FieldControl>
                  <FieldControl icon={faCube} label={props.copy.settings.arxivMaxEntries}>
                    <input type="number" value={props.config.arxiv_max_entries} onChange={(event) => set("arxiv_max_entries", Number(event.target.value))} />
                  </FieldControl>
                  <FieldControl icon={faCube} label={props.copy.settings.arxivMaxPapers}>
                    <input type="number" value={props.config.arxiv_max_papers} onChange={(event) => set("arxiv_max_papers", Number(event.target.value))} />
                  </FieldControl>
                </div>
              ) : null}

              {activeSourceSettings === "twitter" ? (
                <>
                  <p className="help-copy">{props.copy.settings.sourceAdvancedWarningBody}</p>
                  <FieldControl icon={faXmark} label={props.copy.settings.xAccounts}>
                    <textarea rows={6} value={props.config.x_accounts} onChange={(event) => set("x_accounts", event.target.value)} />
                  </FieldControl>
                  <div className="form-grid two">
                    <FieldControl icon={faKey} label={props.copy.settings.xRapidApiKey}>
                      <input value={props.config.x_rapidapi_key} onChange={(event) => set("x_rapidapi_key", event.target.value)} />
                    </FieldControl>
                    <FieldControl icon={faLink} label={props.copy.settings.xRapidApiHost}>
                      <input value={props.config.x_rapidapi_host} onChange={(event) => set("x_rapidapi_host", event.target.value)} />
                    </FieldControl>
                  </div>
                </>
              ) : null}
            </section>
          ) : (
            <div className="empty-inline-state">{props.copy.settings.sourceDetailEmpty}</div>
          )}
        </section> : null}

        {activeTab === "model" ? <section className="control-section">
          <div className="form-field">
            <span>{props.copy.welcome.modelTitle}</span>
            <RadioChoiceGroup
              name="settings-model-mode"
              value={props.config.model_mode}
              columns={2}
              onChange={(value) => set("model_mode", value as ConfigData["model_mode"])}
              options={[
                { value: "custom", label: props.copy.welcome.customMode },
                { value: "managed", label: props.copy.welcome.managedMode },
              ]}
            />
          </div>
        </section> : null}

        {activeTab === "model" ? <section className="control-section">
          <div className="control-section-title"><span>{props.copy.settings.basic}</span></div>
          {props.config.model_mode === "custom" ? (
            <>
              <div className="form-grid model-top-grid">
                <FieldControl icon={faGear} label={props.copy.settings.provider}>
                  <input value="openai" disabled className="input-disabled" />
                </FieldControl>
                <FieldControl icon={faCube} label={props.copy.settings.modelName}>
                  <input value={props.config.model} onChange={(event) => set("model", event.target.value)} />
                </FieldControl>
                <FieldControl icon={faFireFlameCurved} label={props.copy.settings.temperature}>
                  <input type="number" min="0" max="1.5" step="0.1" value={props.config.temperature} onChange={(event) => set("temperature", clampTemperature(event.target.value))} />
                </FieldControl>
              </div>
              <FieldControl icon={faLink} label={props.copy.settings.baseUrl}>
                <input value={props.config.base_url} onChange={(event) => set("base_url", event.target.value)} />
              </FieldControl>
              <FieldControl icon={faKey} label={props.copy.settings.apiKey}>
                <span className="secret-input-wrap">
                  <input type={modelApiKeyVisible ? "text" : "password"} value={props.config.api_key} onChange={(event) => set("api_key", event.target.value)} />
                  <button
                    type="button"
                    className="secret-input-toggle"
                    onClick={() => setModelApiKeyVisible((value) => !value)}
                    aria-label={modelApiKeyVisible ? props.copy.settings.hideApiKey : props.copy.settings.showApiKey}
                  >
                    <FontAwesomeIcon icon={modelApiKeyVisible ? faEyeSlash : faEye} />
                  </button>
                </span>
              </FieldControl>
            </>
          ) : (
            <p className="help-copy">{props.copy.welcome.managedModelHint}</p>
          )}
        </section> : null}

        {activeTab === "mail" ? <section className="control-section">
          <div className="form-field">
            <span>{props.copy.welcome.mailTitle}</span>
            <RadioChoiceGroup
              name="settings-smtp-mode"
              value={props.config.smtp_mode}
              columns={2}
              onChange={(value) => set("smtp_mode", value as ConfigData["smtp_mode"])}
              options={[
                { value: "custom", label: props.copy.welcome.customMode },
                { value: "managed", label: props.copy.welcome.managedMode },
              ]}
            />
          </div>
          {props.config.smtp_mode === "custom" ? (
            <>
              <div className="form-grid two">
                <FieldControl icon={faLink} label={props.copy.settings.smtpServer}>
                  <input value={props.config.smtp_server} onChange={(event) => set("smtp_server", event.target.value)} />
                </FieldControl>
                <FieldControl icon={faGear} label={props.copy.settings.smtpPort}>
                  <input type="number" value={props.config.smtp_port} onChange={(event) => set("smtp_port", Number(event.target.value))} />
                </FieldControl>
              </div>
              <FieldControl icon={faEnvelope} label={props.copy.settings.sender}>
                <input value={props.config.sender} onChange={(event) => set("sender", event.target.value)} />
              </FieldControl>
              <FieldControl icon={faKey} label={props.copy.settings.smtpPassword}>
                <span className="secret-input-wrap">
                  <input type={smtpPasswordVisible ? "text" : "password"} value={props.config.smtp_password} onChange={(event) => set("smtp_password", event.target.value)} />
                  <button
                    type="button"
                    className="secret-input-toggle"
                    onClick={() => setSmtpPasswordVisible((value) => !value)}
                    aria-label={smtpPasswordVisible ? props.copy.settings.hidePassword : props.copy.settings.showPassword}
                  >
                    <FontAwesomeIcon icon={smtpPasswordVisible ? faEyeSlash : faEye} />
                  </button>
                </span>
              </FieldControl>
            </>
          ) : null}
        </section> : null}

        {activeTab === "info" ? <section className="control-section">
          <div className="info-simple">
            <img src={props.appIcon} alt={props.copy.appTitle} className="info-icon large" />
            <strong className="info-brand">iDeer</strong>
            <p className="info-version">{`v${props.version} · ${props.copy.welcome.releaseDate(props.releaseDate)}`}</p>
            <p className="info-slogan">{props.copy.info.slogan}</p>
            <div className="info-disclaimer-block">
              <strong className="info-disclaimer-title">{props.copy.info.disclaimerTitle}</strong>
              <p className="info-disclaimer">{props.copy.info.disclaimer}</p>
            </div>
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
                    <ContributorAvatar githubId={contributor.github_id} name={contributor.name} fallbackSrc={props.fallbackContributorAvatar} />
                    <strong>{contributor.name}</strong>
                  </a>
                ))}
              </div>
            </div> : null}
            {props.githubUrl ? <a className="primary-action info-link centered" href={props.githubUrl} target="_blank" rel="noreferrer" onClick={(event) => { event.preventDefault(); openExternalUrl(props.githubUrl); }}><FontAwesomeIcon icon={faUpRightFromSquare} /> {props.copy.info.github}</a> : null}
          </div>
        </section> : null}

        {activeTab === "sources" ? <section className="control-section section-actions">
          <div className="metric-actions centered-actions">
            <button className="primary-action" onClick={() => void props.onSave()} disabled={props.savingConfig}>{props.savingConfig ? props.copy.settings.saving : props.copy.settings.save}</button>
          </div>
        </section> : null}

        {activeTab === "model" ? <section className="control-section section-actions">
          <div className="settings-footer-actions">
            {props.config.model_mode === "custom" ? (
              <button className="secondary-action" onClick={() => void props.onTestConnection()} disabled={props.testingConnection}>
                {props.testingConnection ? props.copy.settings.testingConnection : props.copy.settings.testConnection}
              </button>
            ) : <span />}
            <div className="settings-footer-actions__right">
              {props.config.model_mode === "custom" && props.connectionTestResult.kind !== "idle" ? <span className={props.connectionTestResult.kind === "success" ? "test-result success" : "test-result error"}>{props.connectionTestResult.message}</span> : null}
              <button className="primary-action" onClick={() => void props.onSave()} disabled={props.savingConfig}>{props.savingConfig ? props.copy.settings.saving : props.copy.settings.save}</button>
            </div>
          </div>
        </section> : null}

        {activeTab === "preferences" ? <section className="control-section section-actions">
          <div className="metric-actions centered-actions">
            <button className="primary-action" onClick={() => void props.onSave()} disabled={props.savingConfig}>{props.savingConfig ? props.copy.settings.saving : props.copy.settings.save}</button>
          </div>
        </section> : null}

        {activeTab === "mail" ? <section className="control-section section-actions">
          <div className="settings-footer-actions">
            <button className="secondary-action" onClick={() => void props.onTestSmtpConnection()} disabled={props.testingSmtpConnection}>
              {props.testingSmtpConnection ? props.copy.settings.testingSmtp : props.copy.settings.testSmtp}
            </button>
            <div className="settings-footer-actions__right">
              {props.smtpTestResult.kind !== "idle" ? <span className={props.smtpTestResult.kind === "success" ? "test-result success" : "test-result error"}>{props.smtpTestResult.message}</span> : null}
              <button className="primary-action" onClick={() => void props.onSave()} disabled={props.savingConfig}>{props.savingConfig ? props.copy.settings.saving : props.copy.settings.save}</button>
            </div>
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

export function WelcomeView(props: {
  copy: AppCopy;
  appIcon: string;
  version: string;
  releaseDate: string;
  config: ConfigData;
  userProfile: UserProfile;
  avatars: Array<{ key: AvatarId; src: string }>;
  saving: boolean;
  testingConnection: boolean;
  connectionTestResult: { kind: "idle" | "success" | "error"; message: string };
  testingSmtpConnection: boolean;
  smtpTestResult: { kind: "idle" | "success" | "error"; message: string };
  languagePreference: LanguagePreference;
  themePreference: ThemePreference;
  deliveryModePreference: RunRequest["delivery_mode"];
  onChangeConfig: (value: ConfigData) => void;
  onChangeUserProfile: (value: UserProfile) => void;
  onChangeLanguage: (value: LanguagePreference) => void;
  onChangeTheme: (value: ThemePreference) => void;
  onChangeDeliveryMode: (value: RunRequest["delivery_mode"]) => void;
  onTestConnection: () => Promise<void>;
  onTestSmtpConnection: () => Promise<void>;
  onComplete: () => Promise<void>;
}) {
  const set = <K extends keyof ConfigData,>(key: K, value: ConfigData[K]) => props.onChangeConfig({ ...props.config, [key]: value });
  const setProfile = <K extends keyof UserProfile,>(key: K, value: UserProfile[K]) => props.onChangeUserProfile({ ...props.userProfile, [key]: value });
  const [interestTags, setInterestTags] = useState<InterestTags>(() => parseInterestDescription(props.config.description));
  const [step, setStep] = useState(0);
  const [customDirectionInput, setCustomDirectionInput] = useState("");

  useEffect(() => {
    setInterestTags(parseInterestDescription(props.config.description));
  }, [props.config.description]);

  const readySourceCount = props.config.visible_sources.filter((key) => VISIBLE_SOURCE_OPTIONS.some((option) => option.key === key && option.type === "ready")).length;
  const canComplete = Boolean(
    props.userProfile.name.trim()
    && props.config.user_researcher_profile.trim()
    && props.config.description.trim()
    && props.config.receiver.trim()
    && readySourceCount > 0,
  );
  const canAdvanceFromProfile = Boolean(props.userProfile.name.trim() && props.config.receiver.trim());
  const canAdvanceFromDirection = Boolean(props.config.user_researcher_profile.trim() && props.config.description.trim());
  const canAdvance = step === 0
    ? canAdvanceFromProfile
    : step === 1
      ? canAdvanceFromDirection
      : step === 4
        ? canComplete
        : true;
  const isLastStep = step === 4;

  function updateInterestTags(next: InterestTags) {
    const normalized = {
      positive: uniqueTags(next.positive),
      negative: uniqueTags(next.negative),
    };
    setInterestTags(normalized);
    set("description", serializeInterestDescription(normalized));
  }

  function addSuggestedDirection(tag: string) {
    updateInterestTags({
      ...interestTags,
      positive: [...interestTags.positive, tag],
    });
  }

  function removeDirection(tag: string) {
    updateInterestTags({
      ...interestTags,
      positive: interestTags.positive.filter((item) => item !== tag),
    });
  }

  function addCustomDirection() {
    const next = splitInterestLine(customDirectionInput);
    if (next.length === 0) {
      return;
    }
    updateInterestTags({
      ...interestTags,
      positive: [...interestTags.positive, ...next],
    });
    setCustomDirectionInput("");
  }

  function toggleVisibleSource(key: VisibleSourceKey) {
    const next = props.config.visible_sources.includes(key)
      ? props.config.visible_sources.filter((item) => item !== key)
      : [...props.config.visible_sources, key];
    set("visible_sources", next as ConfigData["visible_sources"]);
  }

  function setServiceMode(kind: "model" | "smtp", value: ServiceMode) {
    set(kind === "model" ? "model_mode" : "smtp_mode", value as ConfigData["model_mode"]);
  }

  const steps = [
    { key: "profile", index: "01", title: props.copy.welcome.profileTitle, hint: props.copy.welcome.profileHint },
    { key: "direction", index: "02", title: props.copy.welcome.directionTitle, hint: props.copy.welcome.directionHint },
    { key: "model", index: "03", title: props.copy.welcome.modelTitle, hint: props.copy.welcome.modelHint },
    { key: "mail", index: "04", title: props.copy.welcome.mailTitle, hint: props.copy.welcome.mailHint },
    { key: "source", index: "05", title: props.copy.welcome.sourceTitle, hint: props.copy.welcome.sourceHint },
  ] as const;

  return (
    <div className="welcome-overlay">
      <section className="welcome-shell">
        <div className="welcome-hero">
          <img src={props.appIcon} alt={props.copy.appTitle} className="welcome-app-icon" />
          <div>
            <h1>{props.copy.welcome.title}</h1>
            <p>{props.copy.welcome.subtitle}</p>
            <span className="welcome-meta">{`v${props.version} · ${props.copy.welcome.releaseDate(props.releaseDate)}`}</span>
          </div>
        </div>

        <div className="welcome-step-bar">
          {steps.map((item, index) => (
            <button key={item.key} type="button" className={index === step ? "welcome-step-pill active" : "welcome-step-pill"} onClick={() => { if (index <= step) setStep(index); }}>
              <span>{item.index}</span>
              <strong>{item.title}</strong>
            </button>
          ))}
        </div>

        {step === 0 ? (
          <div className="welcome-section">
            <div className="welcome-section-heading">
              <strong>{steps[0].index}</strong>
              <div>
                <h3>{steps[0].title}</h3>
                <p>{steps[0].hint}</p>
              </div>
            </div>
            <div className="avatar-choice-grid">
              {props.avatars.map((avatar) => (
                <button key={avatar.key} className={props.userProfile.avatar === avatar.key ? "avatar-choice active" : "avatar-choice"} onClick={() => setProfile("avatar", avatar.key)}>
                  <img src={avatar.src} alt={avatar.key} className="avatar-choice-image" />
                </button>
              ))}
            </div>
            <div className="form-grid two">
              <label className="form-field"><span>{props.copy.settings.userName}</span><input value={props.userProfile.name} onChange={(event) => setProfile("name", event.target.value)} /></label>
              <label className="form-field"><span>{props.copy.settings.receiver}</span><input value={props.config.receiver} onChange={(event) => { set("receiver", event.target.value); setProfile("receiver", event.target.value); }} /></label>
            </div>
            <div className="form-field">
              <span>{props.copy.settings.language}</span>
              <RadioChoiceGroup
                name="welcome-language"
                value={props.languagePreference}
                columns={3}
                onChange={(value) => props.onChangeLanguage(value as LanguagePreference)}
                options={[
                  { value: "system", label: props.copy.settings.followSystem },
                  { value: "zh", label: props.copy.settings.chinese },
                  { value: "en", label: props.copy.settings.english },
                ]}
              />
            </div>
            <div className="form-field">
              <span>{props.copy.settings.theme}</span>
              <RadioChoiceGroup
                name="welcome-theme"
                value={props.themePreference}
                columns={3}
                onChange={(value) => props.onChangeTheme(value as ThemePreference)}
                options={[
                  { value: "system", label: props.copy.settings.followSystem },
                  { value: "light", label: props.copy.settings.light },
                  { value: "dark", label: props.copy.settings.dark },
                ]}
              />
            </div>
            <p className="help-copy">{props.copy.welcome.receiverHint}</p>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="welcome-section">
            <div className="welcome-section-heading">
              <strong>{steps[1].index}</strong>
              <div>
                <h3>{steps[1].title}</h3>
                <p>{steps[1].hint}</p>
              </div>
            </div>
            <label className="form-field">
              <span>{props.copy.settings.userSelfProfile}</span>
              <textarea rows={4} value={props.config.user_researcher_profile} placeholder={props.copy.welcome.selfProfileHint} onChange={(event) => set("user_researcher_profile", event.target.value)} />
            </label>
            <div className="interest-chip-list welcome-selected-tags">
              {interestTags.positive.length === 0 ? (
                <span className="interest-chip empty">+</span>
              ) : (
                interestTags.positive.map((tag) => (
                  <button key={tag} type="button" className="interest-chip positive" onClick={() => removeDirection(tag)}>
                    <span className="interest-chip-label">{tag}</span>
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                ))
              )}
            </div>
            <div className="interest-input-row">
              <input
                value={customDirectionInput}
                placeholder={props.copy.welcome.directionInputPlaceholder}
                onChange={(event) => setCustomDirectionInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomDirection();
                  }
                }}
              />
              <button type="button" className="secondary-action" onClick={addCustomDirection}>{props.copy.workbench.addTag}</button>
            </div>
            <div className="welcome-direction-groups">
              {WELCOME_DIRECTION_GROUPS.map((group) => (
                <section key={group.title} className="welcome-direction-group" data-tone={group.tone}>
                  <strong>{group.title}</strong>
                  <div className="welcome-direction-tags">
                    {group.tags.map((tag) => (
                      <button key={tag} type="button" className="welcome-direction-tag" onClick={() => addSuggestedDirection(tag)}>
                        {tag}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="welcome-section">
            <div className="welcome-section-heading">
              <strong>{steps[2].index}</strong>
              <div>
                <h3>{steps[2].title}</h3>
                <p>{steps[2].hint}</p>
              </div>
            </div>
            <div className="segmented-toggle-group welcome-mode-toggle">
              <button type="button" className={props.config.model_mode === "custom" ? "segmented-toggle-button active" : "segmented-toggle-button"} onClick={() => setServiceMode("model", "custom")}>{props.copy.welcome.customMode}</button>
              <button type="button" className={props.config.model_mode === "managed" ? "segmented-toggle-button active" : "segmented-toggle-button"} onClick={() => setServiceMode("model", "managed")}>{props.copy.welcome.managedMode}</button>
            </div>
            <p className="help-copy">{props.config.model_mode === "custom" ? props.copy.welcome.customModelHint : props.copy.welcome.managedModelHint}</p>
            {props.config.model_mode === "custom" ? (
              <>
                <div className="form-grid three">
                  <FieldControl icon={faGear} label={props.copy.settings.provider}><input value={props.config.provider} onChange={(event) => set("provider", event.target.value)} /></FieldControl>
                  <FieldControl icon={faCube} label={props.copy.settings.modelName}><input value={props.config.model} onChange={(event) => set("model", event.target.value)} /></FieldControl>
                  <FieldControl icon={faFireFlameCurved} label={props.copy.settings.temperature}><input type="number" min="0" max="1.5" step="0.1" value={props.config.temperature} onChange={(event) => set("temperature", clampTemperature(event.target.value))} /></FieldControl>
                </div>
                <div className="form-grid two">
                  <FieldControl icon={faLink} label={props.copy.settings.baseUrl}><input value={props.config.base_url} onChange={(event) => set("base_url", event.target.value)} /></FieldControl>
                  <FieldControl icon={faKey} label={props.copy.settings.apiKey}><input value={props.config.api_key} onChange={(event) => set("api_key", event.target.value)} /></FieldControl>
                </div>
                <div className="test-connection-row">
                  <button className="secondary-action" onClick={() => void props.onTestConnection()} disabled={props.testingConnection}>
                    {props.testingConnection ? props.copy.settings.testingConnection : props.copy.settings.testConnection}
                  </button>
                  {props.connectionTestResult.kind !== "idle" ? <span className={props.connectionTestResult.kind === "success" ? "test-result success" : "test-result error"}>{props.connectionTestResult.message}</span> : null}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="welcome-section">
            <div className="welcome-section-heading">
              <strong>{steps[3].index}</strong>
              <div>
                <h3>{steps[3].title}</h3>
                <p>{steps[3].hint}</p>
              </div>
            </div>
            <div className="segmented-toggle-group welcome-mode-toggle">
              <button type="button" className={props.config.smtp_mode === "custom" ? "segmented-toggle-button active" : "segmented-toggle-button"} onClick={() => setServiceMode("smtp", "custom")}>{props.copy.welcome.customMode}</button>
              <button type="button" className={props.config.smtp_mode === "managed" ? "segmented-toggle-button active" : "segmented-toggle-button"} onClick={() => setServiceMode("smtp", "managed")}>{props.copy.welcome.managedMode}</button>
            </div>
            <p className="help-copy">{props.config.smtp_mode === "custom" ? props.copy.welcome.customMailHint : props.copy.welcome.managedMailHint}</p>
            {props.config.smtp_mode === "custom" ? (
              <>
                <div className="form-grid three">
                  <FieldControl icon={faLink} label={props.copy.settings.smtpServer}><input value={props.config.smtp_server} onChange={(event) => set("smtp_server", event.target.value)} /></FieldControl>
                  <FieldControl icon={faGear} label={props.copy.settings.smtpPort}><input type="number" value={props.config.smtp_port} onChange={(event) => set("smtp_port", Number(event.target.value))} /></FieldControl>
                  <FieldControl icon={faEnvelope} label={props.copy.settings.sender}><input value={props.config.sender} onChange={(event) => set("sender", event.target.value)} /></FieldControl>
                </div>
                <FieldControl icon={faKey} label={props.copy.settings.smtpPassword}><input type="password" value={props.config.smtp_password} onChange={(event) => set("smtp_password", event.target.value)} /></FieldControl>
              </>
            ) : null}
            <FieldControl icon={faEnvelope} label={props.copy.settings.defaultDeliveryMode}>
              <select value={props.deliveryModePreference} onChange={(event) => props.onChangeDeliveryMode(event.target.value as RunRequest["delivery_mode"])}>
                <option value="source_emails">{props.copy.workbench.sourceEmails}</option>
                <option value="combined_report">{props.copy.workbench.combinedReport}</option>
                <option value="both">{props.copy.workbench.both}</option>
              </select>
            </FieldControl>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="welcome-section">
            <div className="welcome-section-heading">
              <strong>{steps[4].index}</strong>
              <div>
                <h3>{steps[4].title}</h3>
                <p>{steps[4].hint}</p>
              </div>
            </div>
            <div className="visible-source-grid">
              {VISIBLE_SOURCE_OPTIONS.map((source) => {
                const label = source.type === "ready" ? VISIBLE_SOURCE_LABELS[source.key as SourceName] : props.copy.comingSoonSources[source.key];
                return (
                  <label key={source.key} className="visible-source-option">
                    <input type="checkbox" checked={props.config.visible_sources.includes(source.key)} onChange={() => toggleVisibleSource(source.key)} />
                    <span>{label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="welcome-footer">
          <div className="welcome-footer-actions">
            {step > 0 ? <button type="button" className="ghost-action" onClick={() => setStep((prev) => Math.max(0, prev - 1))}>{props.copy.welcome.back}</button> : <span />}
            {!isLastStep ? (
              <button type="button" className="primary-action" onClick={() => setStep((prev) => Math.min(steps.length - 1, prev + 1))} disabled={!canAdvance}>
                {props.copy.welcome.next}
              </button>
            ) : (
              <button className="primary-action" onClick={() => void props.onComplete()} disabled={!canComplete || props.saving}>
                {props.saving ? props.copy.welcome.completing : props.copy.welcome.complete}
              </button>
            )}
          </div>
          {!canAdvance ? <p className="welcome-required-hint">{props.copy.welcome.requiredHint}</p> : <span />}
        </div>
      </section>
    </div>
  );
}

export function SidebarButton(props: { icon: IconDefinition; label: string; active: boolean; onClick: () => void }) {
  return <button className={props.active ? "sidebar-button active" : "sidebar-button"} onClick={props.onClick}><span className="sidebar-icon"><FontAwesomeIcon icon={props.icon} /></span><strong>{props.label}</strong></button>;
}

export function HomeView(props: {
  backendHealthy: boolean; loadingData: boolean; errorText: string; statusText: string; config: ConfigData; copy: AppCopy;
  recentHistory: HistoryEntry[]; sources: SourceCard[]; comingSoonSources: ReadonlyArray<{ key: string; label: string }>; startingBackend: boolean; runForm: RunRequest; runState: RunState; logs: string[]; runFiles: RunOutputFile[]; historyLoading: boolean; runDisabledReason: string;
  onOpenSettings: () => void; onRefresh: () => Promise<void>; onRun: () => void; onRefreshHistory: () => Promise<void>;
  onStartBackend: () => Promise<void>; onStopBackend: () => Promise<void>; onOpenHistory: (entry: HistoryEntry) => Promise<void>;
  onToggleSource: (source: SourceName) => void; onChangeRunForm: <K extends keyof RunRequest>(key: K, value: RunRequest[K]) => void; onSaveInterestDescription: (value: string) => Promise<void>; savingInterestDescription: boolean;
}) {
  const [showComingSoonToast, setShowComingSoonToast] = useState(false);
  const deliveryModeLabel = props.runForm.delivery_mode === "source_emails"
    ? props.copy.workbench.sourceEmails
    : props.runForm.delivery_mode === "both"
      ? props.copy.workbench.both
      : props.copy.workbench.combinedReport;
  const runReceiver = props.runForm.receiver || props.config.receiver || props.copy.home.noReceiver;
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
          <div className="section-heading source-section-heading">
            <div>
              <h3>{props.copy.home.sources}</h3>
              <p className="section-supporting-copy">{props.copy.home.sourcesHint}</p>
            </div>
            <span className="selection-status-pill">{props.copy.home.selectedSources(props.runForm.sources.length)}</span>
          </div>

          {props.sources.length === 0 && props.comingSoonSources.length === 0 ? (
            <div className="empty-inline-state">
              <span>{props.copy.home.noSourcesActive}</span>
              <button type="button" className="secondary-action" onClick={props.onOpenSettings}>{props.copy.home.openSettings}</button>
            </div>
          ) : null}

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

          <div className="source-run-panel">
            <div className="source-run-summary">
              <strong>{props.copy.workbench.readyToRun}</strong>
              <span>{`${props.copy.home.selectedSources(props.runForm.sources.length)} · ${runReceiver} · ${deliveryModeLabel}`}</span>
            </div>
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

          <section className="source-settings-panel">
            <div className="section-heading compact">
              <h4>{props.copy.workbench.quickSettings}</h4>
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
              {props.runFiles.map((file) => <li key={getRunOutputKey(file)}>{renderRunOutputLabel(file)}</li>)}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}

export function WorkbenchView(props: {
  backendHealthy: boolean; runForm: RunRequest; runState: RunState; logs: string[]; runFiles: RunOutputFile[]; copy: AppCopy;
  sources: SourceCard[]; historyLoading: boolean; onRun: () => void; onRefreshHistory: () => Promise<void>;
  onToggleSource: (source: SourceName) => void; onChangeRunForm: <K extends keyof RunRequest>(key: K, value: RunRequest[K]) => void;
}) {
  return <section className="page-grid workbench-grid">
    <div className="content-panel workbench-main">
      <div className="section-heading"><div><h3>{props.copy.workbench.title}</h3></div><button className="primary-action" onClick={props.onRun} disabled={!props.backendHealthy || props.runState === "running" || props.runForm.sources.length === 0}>{props.runState === "running" ? props.copy.workbench.running : props.copy.workbench.run}</button></div>
      <div className="source-picker-grid">{props.sources.map((source) => <label key={source.key} data-source={source.key} className={source.selected ? "source-picker-card active" : "source-picker-card"}><input type="checkbox" checked={source.selected} onChange={() => props.onToggleSource(source.key)} /><img src={source.icon} alt={source.label} className="source-icon large" /><div><strong>{source.label}</strong><p>{source.description}</p></div></label>)}</div>
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
      <section className="content-panel"><div className="section-heading compact"><h3>{props.copy.workbench.outputs}</h3><button className="secondary-action" onClick={() => void props.onRefreshHistory()} disabled={props.historyLoading}>{props.historyLoading ? props.copy.library.refreshing : props.copy.workbench.refreshHistory}</button></div>{props.runFiles.length === 0 ? <div className="empty-state">{props.copy.workbench.outputEmpty}</div> : <ul className="file-output-list">{props.runFiles.map((file) => <li key={getRunOutputKey(file)}>{renderRunOutputLabel(file)}</li>)}</ul>}</section>
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

function clampTemperature(value: string) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.min(1.5, Math.max(0, numeric));
}

function ProfileTagBucket(props: {
  tone: "positive" | "negative";
  label: string;
  tags: string[];
  active: boolean;
  inputValue: string;
  onStartAdd: () => void;
  onInputChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onRemove: (tag: string) => void;
}) {
  return (
    <section className={`profile-tag-bucket ${props.tone}`}>
      <div className="profile-tag-bucket-header">
        <strong>{props.label}</strong>
      </div>
      <div className="profile-pill-list">
        {props.tags.map((tag) => (
          <span key={`${props.tone}-${tag}`} className={`profile-pill ${props.tone}`}>
            <span className="profile-pill-label">{tag}</span>
            <button type="button" className="profile-pill-remove" aria-label={`remove ${tag}`} onClick={() => props.onRemove(tag)}>
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </span>
        ))}
        {props.active ? (
          <input
            autoFocus
            className={`profile-pill-input ${props.tone}`}
            value={props.inputValue}
            placeholder="+"
            onChange={(event) => props.onInputChange(event.target.value)}
            onBlur={props.onCommit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                props.onCommit();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                props.onCancel();
              }
            }}
          />
        ) : (
          <button type="button" className="profile-pill add" onClick={props.onStartAdd}>+</button>
        )}
      </div>
    </section>
  );
}

function getGitHubAvatarUrl(githubId: string) {
  return `https://github.com/${githubId}.png?size=160`;
}

function ContributorAvatar(props: { githubId: string; name: string; fallbackSrc: string }) {
  const [src, setSrc] = useState(props.fallbackSrc);

  useEffect(() => {
    let active = true;
    const remoteSrc = getGitHubAvatarUrl(props.githubId);
    const image = new window.Image();
    setSrc(props.fallbackSrc);
    image.onload = () => {
      if (active) {
        setSrc(remoteSrc);
      }
    };
    image.onerror = () => {
      if (active) {
        setSrc(props.fallbackSrc);
      }
    };
    image.src = remoteSrc;
    return () => {
      active = false;
    };
  }, [props.fallbackSrc, props.githubId]);

  return <img src={src} alt={props.name} className="info-author-avatar" />;
}

function resolveContributorGithubLink(contributor: MainContributor) {
  return `https://github.com/${contributor.github_id}`;
}

function formatRunState(copy: AppCopy, runState: RunState) {
  return copy.workbench.runStates[runState];
}
