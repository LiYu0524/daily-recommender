import { useEffect, useMemo, useRef, useState } from "react";
import {
  checkHealth,
  getAboutInfo,
  getConfig,
  getHistory,
  getPublicMeta,
  getResults,
  openRunSocket,
  saveConfig,
  testOpenAICompatibleApi,
} from "./api";
import {
  ControlCenter,
  HomeView,
  LibraryView,
  SidebarButton,
  TitleBar,
  WelcomeView,
} from "./desktopViews";
import {
  emitConfigChange,
  emitPreferenceChange,
  emitUserProfileChange,
  isTauriDesktop,
  listenConfigChange,
  listenPreferenceChange,
  listenUserProfileChange,
  loadDesktopConfig,
  openExternalUrl,
  readManagedBackendLog,
  saveDesktopConfig,
  startManagedBackend,
  stopManagedBackend,
  testSmtpConnection,
} from "./desktop";
import {
  COPY,
  resolveLanguage,
  resolveTheme,
  type LanguagePreference,
  type ThemePreference,
} from "./copy";
import { normalizeRunOutputs } from "./runOutputs";
import type {
  AboutInfo,
  AvatarId,
  ComingSoonSourceKey,
  ConfigData,
  DeliveryMode,
  HistoryEntry,
  PublicMeta,
  ResultSet,
  RunCompleteMessage,
  RunMessage,
  RunOutputFile,
  RunRequest,
  SourceName,
  UserProfile,
} from "./types";
import iconArxiv from "./assets/icon_arxiv.svg";
import avatar0 from "./assets/avatar/0.svg";
import avatar1 from "./assets/avatar/1.svg";
import avatar2 from "./assets/avatar/2.svg";
import avatar3 from "./assets/avatar/3.svg";
import iconGitHub from "./assets/icon_github.svg";
import iconGitHubWhite from "./assets/icon_github.white.svg";
import iconHF from "./assets/icon_hf.svg";
import iconIDeer from "./assets/icon_ideer.svg";
import iconX from "./assets/icon_x.svg";
import iconXBlack from "./assets/icon_x.black.svg";
import "./desktop.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faFire, faFolderOpen, faHouse, faStar } from "@fortawesome/free-solid-svg-icons";
import { SwipeView } from "./swipeView";

type ViewName = "home" | "library" | "swipe";
type RunState = "idle" | "running" | "done" | "error";
type ControlPanel = "none" | "settings";
type SettingsTab = "profile" | "preferences" | "sources" | "model" | "mail" | "info";
type StatusState =
  | { kind: "connecting" }
  | { kind: "waitingDesktop" }
  | { kind: "waitingWeb" }
  | { kind: "connected" }
  | { kind: "backendStarted" }
  | { kind: "backendStopped" }
  | { kind: "configSaved"; localOnly: boolean }
  | { kind: "profileSaved" }
  | { kind: "runDone"; date: string }
  | { kind: "runExited" }
  | { kind: "socketError" };

const DEFAULT_CONFIG: ConfigData = {
  desktop_python_path: "",
  profile_name: "",
  profile_avatar: "1",
  onboarding_completed: false,
  model_mode: "custom",
  smtp_mode: "custom",
  provider: "openai", model: "gpt-4o-mini", base_url: "", api_key: "", temperature: 0.5,
  smtp_server: "", smtp_port: 465, sender: "", receiver: "", smtp_password: "",
  gh_languages: "all", gh_since: "daily", gh_max_repos: 30,
  hf_content_types: ["papers", "models"], hf_max_papers: 30, hf_max_models: 15,
  description: "", researcher_profile: "", user_researcher_profile: "", x_rapidapi_key: "",
  x_rapidapi_host: "twitter-api45.p.rapidapi.com", x_accounts: "",
  arxiv_categories: "cs.AI", arxiv_max_entries: 100, arxiv_max_papers: 60, log_level: "standard",
  visible_sources: ["github", "huggingface", "arxiv"],
};

const DEFAULT_RUN_FORM: RunRequest = {
  sources: ["github", "huggingface", "arxiv"], generate_report: true, generate_ideas: false,
  save: true, receiver: "", description: "", researcher_profile: "", scholar_url: "",
  x_accounts_input: "", delivery_mode: "combined_report",
};

const DEFAULT_PROFILE: UserProfile = {
  name: "",
  receiver: "",
  focus: "",
  self_profile: "",
  avatar: "1",
};

const AVATARS = [
  { key: "0", src: avatar0 },
  { key: "1", src: avatar1 },
  { key: "2", src: avatar2 },
  { key: "3", src: avatar3 },
] satisfies Array<{ key: AvatarId; src: string }>;

const DEFAULT_ABOUT_INFO: AboutInfo = {
  github_url: "https://github.com/LiYu0524/iDeer/",
  contributors: [
    { name: "Yu Li", github_id: "LiYu0524", url: "https://yuli-cs.net" },
    { name: "Tianle Hu", github_id: "Horiz21", url: "https://hutianle.com" },
  ],
};

const SOURCES = [
  { key: "github", label: "GitHub", description: "Trending 仓库和工程动态", iconLight: iconGitHub, iconDark: iconGitHubWhite, iconActive: iconGitHubWhite },
  { key: "huggingface", label: "HuggingFace", description: "论文与模型动态", iconLight: iconHF, iconDark: iconHF, iconActive: iconHF },
  { key: "twitter", label: "X", description: "账号时间线和圈层信号", iconLight: iconXBlack, iconDark: iconX, iconActive: iconX },
  { key: "arxiv", label: "arXiv", description: "新论文抓取与筛选", iconLight: iconArxiv, iconDark: iconArxiv, iconActive: iconArxiv },
] satisfies Array<{ key: SourceName; label: string; description: string; iconLight: string; iconDark: string; iconActive: string }>;

const COMING_SOON_SOURCE_KEYS = ["wos", "cnki", "wechat", "scholar"] as const satisfies ReadonlyArray<ComingSoonSourceKey>;
const ALL_VISIBLE_SOURCE_KEYS = [...SOURCES.map((item) => item.key), ...COMING_SOON_SOURCE_KEYS] as const;
const DEFAULT_ENABLED_SOURCES: SourceName[] = ["github", "huggingface", "arxiv"];
const APP_VERSION = "0.1.1";
const RELEASE_DATE = "2026-04-10";

function normalizeVisibleSources(value: ConfigData["visible_sources"] | undefined) {
  const items = Array.isArray(value) ? value : [];
  const normalized = ALL_VISIBLE_SOURCE_KEYS.filter((key) => items.includes(key));
  return normalized.length > 0 ? [...normalized] : [...DEFAULT_ENABLED_SOURCES];
}

function normalizeProfileAvatar(value: ConfigData["profile_avatar"] | UserProfile["avatar"] | undefined): AvatarId {
  return value === "0" || value === "1" || value === "2" || value === "3" ? value : "1";
}

function hasOnboardingBasics(config: ConfigData) {
  return Boolean(
    config.onboarding_completed
    && config.profile_name.trim()
    && config.receiver.trim()
    && config.user_researcher_profile.trim()
    && config.description.trim()
    && config.visible_sources.some((key) => SOURCES.some((source) => source.key === key)),
  );
}

function parseInterestSummary(value: string) {
  const raw = value.trim();
  if (!raw) {
    return { positive: [] as string[], negative: [] as string[] };
  }

  const positive: string[] = [];
  const negative: string[] = [];
  let structured = false;

  for (const line of raw.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    if (/^(positive|正向|喜欢|关注)\s*:/i.test(line)) {
      positive.push(...line.replace(/^[^:：]+[:：]\s*/u, "").split(/[|,，;\n]/g).map((item) => item.trim()).filter(Boolean));
      structured = true;
      continue;
    }
    if (/^(negative|负向|排除|屏蔽)\s*:/i.test(line)) {
      negative.push(...line.replace(/^[^:：]+[:：]\s*/u, "").split(/[|,，;\n]/g).map((item) => item.trim()).filter(Boolean));
      structured = true;
      continue;
    }
  }

  if (!structured) {
    return {
      positive: raw.split(/[|,，;\n]/g).map((item) => item.trim()).filter(Boolean),
      negative: [],
    };
  }

  return { positive, negative };
}

export default function AppShell() {
  const desktopWindow = isTauriDesktop();
  const showCustomTitleBar = !desktopWindow;
  const socketRef = useRef<WebSocket | null>(null);
  const [languagePreference, setLanguagePreference] = useState<LanguagePreference>(() => readPreference("ideer.language", "system"));
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => readPreference("ideer.theme", "system"));
  const [deliveryModePreference, setDeliveryModePreference] = useState<DeliveryMode>(() => readPreference("ideer.deliveryMode", "combined_report"));
  const language = resolveLanguage(languagePreference);
  const theme = resolveTheme(themePreference);
  const copy = COPY[language];
  const [activeView, setActiveView] = useState<ViewName>("home");
  const [controlPanel, setControlPanel] = useState<ControlPanel>("none");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("profile");
  const [userProfile, setUserProfile] = useState<UserProfile>(() => normalizeUserProfile(readJsonPreference("ideer.user", DEFAULT_PROFILE)));
  const [backendHealthy, setBackendHealthy] = useState(false);
  const [startingBackend, setStartingBackend] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [meta, setMeta] = useState<PublicMeta | null>(null);
  const [aboutInfo, setAboutInfo] = useState<AboutInfo>(DEFAULT_ABOUT_INFO);
  const [config, setConfig] = useState<ConfigData>(DEFAULT_CONFIG);
  const [runForm, setRunForm] = useState<RunRequest>(DEFAULT_RUN_FORM);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [selectedResult, setSelectedResult] = useState<ResultSet | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [runFiles, setRunFiles] = useState<RunOutputFile[]>([]);
  const [runState, setRunState] = useState<RunState>("idle");
  const [status, setStatus] = useState<StatusState>({ kind: "connecting" });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingInterestDescription, setSavingInterestDescription] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<{ kind: "idle" | "success" | "error"; message: string }>({ kind: "idle", message: "" });
  const [testingSmtpConnection, setTestingSmtpConnection] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ kind: "idle" | "success" | "error"; message: string }>({ kind: "idle", message: "" });
  const [errorText, setErrorText] = useState("");
  const [welcomeReady, setWelcomeReady] = useState(false);
  const statusText = resolveStatusText(copy, status);

  useEffect(() => {
    void initialize();
    const timer = window.setInterval(() => void refreshHealth(), 5000);
    return () => {
      window.clearInterval(timer);
      socketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem("ideer.language", languagePreference);
    void emitPreferenceChange({ languagePreference, themePreference, deliveryModePreference });
  }, [languagePreference]);

  useEffect(() => {
    window.localStorage.setItem("ideer.theme", themePreference);
    void emitPreferenceChange({ languagePreference, themePreference, deliveryModePreference });
  }, [themePreference]);

  useEffect(() => {
    window.localStorage.setItem("ideer.deliveryMode", deliveryModePreference);
    setRunForm((prev) => prev.delivery_mode === deliveryModePreference ? prev : { ...prev, delivery_mode: deliveryModePreference });
    void emitPreferenceChange({ languagePreference, themePreference, deliveryModePreference });
  }, [deliveryModePreference]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const handleStorage = () => {
      const nextLanguage = readPreference<LanguagePreference>("ideer.language", "system");
      const nextTheme = readPreference<ThemePreference>("ideer.theme", "system");
      const nextDeliveryMode = readPreference<DeliveryMode>("ideer.deliveryMode", "combined_report");
      setLanguagePreference((prev) => prev === nextLanguage ? prev : nextLanguage);
      setThemePreference((prev) => prev === nextTheme ? prev : nextTheme);
      setDeliveryModePreference((prev) => prev === nextDeliveryMode ? prev : nextDeliveryMode);
    };

    window.addEventListener("storage", handleStorage);

    let unlisten: (() => void) | undefined;
    let unlistenConfig: (() => void) | undefined;
    let unlistenUserProfile: (() => void) | undefined;
    void listenPreferenceChange((payload) => {
      setLanguagePreference((prev) => prev === payload.languagePreference ? prev : payload.languagePreference);
      setThemePreference((prev) => prev === payload.themePreference ? prev : payload.themePreference);
      setDeliveryModePreference((prev) => prev === payload.deliveryModePreference ? prev : payload.deliveryModePreference);
    }).then((dispose) => {
      unlisten = dispose;
    });

    void listenConfigChange((nextConfig) => {
      const normalizedConfig = {
        ...DEFAULT_CONFIG,
        ...nextConfig,
        visible_sources: normalizeVisibleSources(nextConfig.visible_sources),
        profile_avatar: normalizeProfileAvatar(nextConfig.profile_avatar),
      };
      setConfig(normalizedConfig);
      setRunForm((prev) => ({
        ...prev,
        receiver: normalizedConfig.receiver,
        description: normalizedConfig.description,
        researcher_profile: normalizedConfig.researcher_profile,
      }));
      setUserProfile((prev) => normalizeUserProfile({
        ...prev,
        name: normalizedConfig.profile_name || prev.name,
        avatar: normalizeProfileAvatar(normalizedConfig.profile_avatar),
        receiver: normalizedConfig.receiver,
        focus: normalizedConfig.description,
        self_profile: normalizedConfig.user_researcher_profile || prev.self_profile,
      }));
    }).then((dispose) => {
      unlistenConfig = dispose;
    });

    void listenUserProfileChange((nextProfile) => {
      setUserProfile(normalizeUserProfile(nextProfile));
      window.localStorage.setItem("ideer.user", JSON.stringify(normalizeUserProfile(nextProfile)));
    }).then((dispose) => {
      unlistenUserProfile = dispose;
    });

    return () => {
      window.removeEventListener("storage", handleStorage);
      unlisten?.();
      unlistenConfig?.();
      unlistenUserProfile?.();
    };
  }, []);

  useEffect(() => {
    const enabledRunSources = SOURCES
      .map((item) => item.key)
      .filter((key) => config.visible_sources.includes(key));
    setRunForm((prev) => {
      const nextSources = prev.sources.filter((key) => enabledRunSources.includes(key));
      if (nextSources.length === prev.sources.length) {
        return prev;
      }
      return { ...prev, sources: nextSources };
    });
  }, [config.visible_sources]);

  useEffect(() => {
    setConnectionTestResult({ kind: "idle", message: "" });
  }, [config.provider, config.model, config.base_url, config.api_key]);

  useEffect(() => {
    setSmtpTestResult({ kind: "idle", message: "" });
  }, [config.smtp_server, config.smtp_port]);

  useEffect(() => {
    if (themePreference !== "system") {
      return;
    }
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      document.documentElement.dataset.theme = resolveTheme("system");
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [themePreference]);

  async function initialize() {
    await hydrateLocalDesktopConfig();
    void loadAboutData();
    if (await refreshHealth()) {
      await hydrate();
    } else {
      setLoadingData(false);
      setStatus({ kind: isTauriDesktop() ? "waitingDesktop" : "waitingWeb" });
    }
    setWelcomeReady(true);
  }

  async function refreshHealth() {
    try {
      await checkHealth();
      setBackendHealthy(true);
      return true;
    } catch {
      setBackendHealthy(false);
      return false;
    }
  }

  async function loadAboutData() {
    try {
      const data = await getAboutInfo();
      setAboutInfo(data);
    } catch {
      setAboutInfo(DEFAULT_ABOUT_INFO);
    }
  }

  async function hydrateLocalDesktopConfig() {
    if (!desktopWindow) {
      return;
    }
    try {
      const localConfig = await loadDesktopConfig();
      if (!localConfig) {
        return;
      }
      setConfig({
        ...DEFAULT_CONFIG,
        ...localConfig,
        visible_sources: normalizeVisibleSources(localConfig.visible_sources),
        profile_avatar: normalizeProfileAvatar(localConfig.profile_avatar),
      });
      setRunForm((prev) => ({
        ...prev,
        receiver: localConfig.receiver,
        description: localConfig.description,
        researcher_profile: localConfig.researcher_profile,
      }));
      setUserProfile((prev) => normalizeUserProfile({
        ...prev,
        name: localConfig.profile_name || prev.name,
        avatar: normalizeProfileAvatar(localConfig.profile_avatar),
        receiver: localConfig.receiver || prev.receiver,
        focus: localConfig.description,
        self_profile: localConfig.user_researcher_profile || prev.self_profile,
      }));
    } catch {
      // ignore local config parse failures and keep defaults
    }
  }

  async function hydrate() {
    try {
      setLoadingData(true);
      const [metaData, configData, historyData] = await Promise.all([getPublicMeta(), getConfig(), getHistory()]);
      setMeta(metaData);
      setConfig({
        ...DEFAULT_CONFIG,
        ...configData,
        visible_sources: normalizeVisibleSources(configData.visible_sources),
        profile_avatar: normalizeProfileAvatar(configData.profile_avatar),
      });
      setRunForm((prev) => ({ ...prev, receiver: configData.receiver, description: configData.description, researcher_profile: configData.researcher_profile }));
      setUserProfile((prev) => normalizeUserProfile({
        ...prev,
        name: configData.profile_name || prev.name,
        avatar: normalizeProfileAvatar(configData.profile_avatar),
        receiver: configData.receiver || prev.receiver,
        focus: configData.description,
        self_profile: configData.user_researcher_profile || prev.self_profile,
      }));
      setHistory(historyData);
      setStatus({ kind: "connected" });
      setErrorText("");
    } catch (error) {
      setErrorText(getErrorMessage(error, copy));
    } finally {
      setLoadingData(false);
    }
  }

  async function handleStartBackend() {
    try {
      setStartingBackend(true);
      setErrorText("");
      setLogs([copy.runtime.backendStartingLog]);
      await startManagedBackend();
      for (let i = 0; i < 12; i += 1) {
        if (await refreshHealth()) {
          await hydrate();
          setStatus({ kind: "backendStarted" });
          setLogs((prev) => [...prev, copy.runtime.backendStartedLog]);
          return;
        }
        await delay(1000);
      }
      const backendLog = await readManagedBackendLog().catch(() => "");
      const message = backendLog
        ? `${copy.runtime.backendHealthCheckFailed}\n\n${copy.runtime.backendLogLabel}\n${backendLog}`
        : `${copy.runtime.backendHealthCheckFailed} ${copy.runtime.backendHealthCheckHint}`;
      setErrorText(message);
      setLogs((prev) => [...prev, `${copy.runtime.backendStartFailedLog}\n${message}`]);
    } catch (error) {
      const backendLog = await readManagedBackendLog().catch(() => "");
      const errorMessage = getErrorMessage(error, copy);
      const message = backendLog && !errorMessage.includes(backendLog)
        ? `${errorMessage}\n\n${copy.runtime.backendLogLabel}\n${backendLog}`
        : errorMessage;
      setErrorText(message);
      setLogs((prev) => [...prev, `${copy.runtime.backendStartFailedLog}\n${message}`]);
    } finally {
      setStartingBackend(false);
    }
  }

  async function handleStopBackend() {
    await stopManagedBackend();
    setBackendHealthy(false);
    setStatus({ kind: "backendStopped" });
  }

  async function refreshHistoryList() {
    if (!backendHealthy) return;
    try {
      setHistoryLoading(true);
      setHistory(await getHistory());
    } catch (error) {
      setErrorText(getErrorMessage(error, copy));
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openHistory(entry: HistoryEntry) {
    if (!backendHealthy) return;
    setSelectedResult(await getResults(entry.type, entry.date));
    setActiveView("library");
  }

  async function persistConfig() {
    try {
      setSavingConfig(true);
      setRunForm((prev) => ({
        ...prev,
        receiver: config.receiver,
        description: config.description,
        researcher_profile: config.researcher_profile,
      }));
      setUserProfile((prev) => normalizeUserProfile({
        ...prev,
        receiver: config.receiver || prev.receiver,
        focus: config.description,
        self_profile: config.user_researcher_profile || prev.self_profile,
      }));
      const nextConfig = {
        ...config,
        visible_sources: normalizeVisibleSources(config.visible_sources),
        profile_name: userProfile.name.trim(),
        profile_avatar: normalizeProfileAvatar(userProfile.avatar),
      };
      setConfig(nextConfig);
      if (desktopWindow) {
        await saveDesktopConfig(nextConfig);
        await emitConfigChange(nextConfig);
      }
      if (backendHealthy) {
        await saveConfig(nextConfig);
      }
      setStatus({ kind: "configSaved", localOnly: !backendHealthy });
    } catch (error) {
      setErrorText(getErrorMessage(error, copy));
    } finally {
      setSavingConfig(false);
    }
  }

  async function persistInterestDescription(description: string) {
    const nextDescription = description.trim();
    const nextConfig = {
      ...config,
      description: nextDescription,
    };
    try {
      setSavingInterestDescription(true);
      setConfig(nextConfig);
      setRunForm((prev) => ({
        ...prev,
        description: nextDescription,
      }));
      setUserProfile((prev) => normalizeUserProfile({
        ...prev,
        focus: nextDescription,
        self_profile: config.user_researcher_profile || prev.self_profile,
      }));
      if (desktopWindow) {
        await saveDesktopConfig(nextConfig);
        await emitConfigChange(nextConfig);
      }
      if (backendHealthy) {
        await saveConfig(nextConfig);
      }
      setStatus({ kind: "configSaved", localOnly: !backendHealthy });
    } catch (error) {
      setErrorText(getErrorMessage(error, copy));
    } finally {
      setSavingInterestDescription(false);
    }
  }

  async function persistUserProfile() {
    const nextProfile = {
      ...normalizeUserProfile(userProfile),
      receiver: userProfile.receiver.trim(),
      focus: userProfile.focus.trim(),
      self_profile: config.user_researcher_profile.trim(),
      name: userProfile.name.trim(),
    };
    const nextConfig = {
      ...config,
      receiver: nextProfile.receiver,
      description: nextProfile.focus,
      user_researcher_profile: nextProfile.self_profile,
      profile_name: nextProfile.name,
      profile_avatar: normalizeProfileAvatar(nextProfile.avatar),
    };
    try {
      setSavingProfile(true);
      setUserProfile(nextProfile);
      setConfig(nextConfig);
      setRunForm((prev) => ({
        ...prev,
        receiver: nextProfile.receiver,
        description: nextProfile.focus,
      }));
      window.localStorage.setItem("ideer.user", JSON.stringify(nextProfile));
      await emitUserProfileChange(nextProfile);
      if (desktopWindow) {
        await saveDesktopConfig(nextConfig);
        await emitConfigChange(nextConfig);
      }
      if (backendHealthy) {
        await saveConfig(nextConfig);
      }
      setStatus({ kind: "profileSaved" });
    } catch (error) {
      setErrorText(getErrorMessage(error, copy));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleTestConnection() {
    try {
      setTestingConnection(true);
      const result = await testOpenAICompatibleApi({
        baseUrl: config.base_url,
        apiKey: config.api_key,
        model: config.model,
      });
      setConnectionTestResult({ kind: "success", message: result.message });
    } catch (error) {
      setConnectionTestResult({ kind: "error", message: getErrorMessage(error, copy) });
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleTestSmtpConnection() {
    try {
      const smtpReceiver = (config.receiver || userProfile.receiver).trim();
      if (!smtpReceiver) {
        throw new Error(copy.runtime.smtpReceiverRequired);
      }
      if (config.smtp_mode === "custom" && !config.smtp_server.trim()) {
        throw new Error(copy.runtime.smtpServerRequired);
      }
      if (config.smtp_mode === "custom" && !config.sender.trim()) {
        throw new Error(copy.runtime.smtpSenderRequired);
      }
      if (config.smtp_mode === "custom" && !config.smtp_password.trim()) {
        throw new Error(copy.runtime.smtpPasswordRequired);
      }
      setTestingSmtpConnection(true);
      const result = await testSmtpConnection(
        config.smtp_mode,
        config.smtp_server,
        config.smtp_port,
        config.sender,
        config.smtp_password,
        smtpReceiver,
      );
      setSmtpTestResult({ kind: "success", message: result });
    } catch (error) {
      setSmtpTestResult({ kind: "error", message: getErrorMessage(error, copy) });
    } finally {
      setTestingSmtpConnection(false);
    }
  }

  async function completeOnboarding() {
    const nextProfile = normalizeUserProfile({
      ...userProfile,
      name: userProfile.name.trim(),
      receiver: config.receiver.trim(),
      focus: config.description.trim(),
      self_profile: config.user_researcher_profile.trim(),
      avatar: normalizeProfileAvatar(userProfile.avatar),
    });
    const visibleSources = normalizeVisibleSources(config.visible_sources);
    const enabledRunSources = SOURCES.map((source) => source.key).filter((source) => visibleSources.includes(source));
    const nextConfig = {
      ...config,
      profile_name: nextProfile.name,
      profile_avatar: normalizeProfileAvatar(nextProfile.avatar),
      onboarding_completed: true,
      receiver: nextProfile.receiver,
      description: nextProfile.focus,
      user_researcher_profile: nextProfile.self_profile,
      visible_sources: visibleSources,
    };

    if (!hasOnboardingBasics(nextConfig)) {
      setErrorText(copy.welcome.requiredHint);
      return;
    }

    try {
      setSavingConfig(true);
      setSavingProfile(true);
      setConfig(nextConfig);
      setUserProfile(nextProfile);
      setRunForm((prev) => ({
        ...prev,
        receiver: nextConfig.receiver,
        description: nextConfig.description,
        sources: enabledRunSources.length > 0 ? enabledRunSources : prev.sources,
      }));
      window.localStorage.setItem("ideer.user", JSON.stringify(nextProfile));
      await emitUserProfileChange(nextProfile);
      if (desktopWindow) {
        await saveDesktopConfig(nextConfig);
        await emitConfigChange(nextConfig);
      }
      if (backendHealthy) {
        await saveConfig(nextConfig);
      }
      setStatus({ kind: "profileSaved" });
      setErrorText("");
    } catch (error) {
      setErrorText(getErrorMessage(error, copy));
    } finally {
      setSavingConfig(false);
      setSavingProfile(false);
    }
  }

  async function openControlPanel(tab: SettingsTab = "profile") {
    setSettingsTab(tab);
    setControlPanel("settings");
  }

  function runWorkflow() {
    if (!backendHealthy) return;
    socketRef.current?.close();
    setLogs([]);
    setRunFiles([]);
    setRunState("running");
    socketRef.current = openRunSocket(runForm, {
      onMessage(message) {
        if (message.type === "complete") {
          const done = message as RunCompleteMessage;
          setRunFiles(normalizeRunOutputs(done.files));
          setRunState(done.success ? "done" : "error");
          setStatus(done.success ? { kind: "runDone", date: done.date } : { kind: "runExited" });
          void refreshHistoryList();
          return;
        }
        setLogs((prev) => [...prev, (message as RunMessage & { message: string }).message]);
        if (message.type === "error") setRunState("error");
      },
      onError() {
        setRunState("error");
        setStatus({ kind: "socketError" });
      },
      onClose() {
        socketRef.current = null;
      },
    });
  }

  const sources = useMemo(() => SOURCES.flatMap((item) => {
    if (!config.visible_sources.includes(item.key)) {
      return [];
    }
    const selected = runForm.sources.includes(item.key);
    return [{
      ...item,
      description: copy.sourceDescriptions[item.key],
      selected,
      icon: selected ? item.iconActive : theme === "dark" ? item.iconDark : item.iconLight,
    }];
  }), [config.visible_sources, copy, runForm.sources, theme]);
  const comingSoonSources = useMemo(
    () => COMING_SOON_SOURCE_KEYS
      .filter((key) => config.visible_sources.includes(key))
      .map((key) => ({ key, label: copy.comingSoonSources[key] })),
    [config.visible_sources, copy],
  );
  const avatarMap = useMemo(() => Object.fromEntries(AVATARS.map((item) => [item.key, item.src])) as Record<AvatarId, string>, []);
  const sidebarName = userProfile.name || copy.user.fallbackName;
  const sidebarReceiver = runForm.receiver || config.receiver || userProfile.receiver || copy.home.noReceiver;
  const sidebarDeliveryMode = deliveryModePreference === "source_emails"
    ? copy.workbench.sourceEmails
    : deliveryModePreference === "both"
      ? copy.workbench.both
      : copy.workbench.combinedReport;
  const interestSummary = useMemo(() => {
    const tags = parseInterestSummary(config.description || userProfile.focus);
    const preview = tags.positive.slice(0, 2).join(" · ") || userProfile.focus || copy.user.fallbackFocus;
    const extra = tags.positive.length > 2 ? ` +${tags.positive.length - 2}` : "";
    const negative = tags.negative.length > 0 ? ` / -${tags.negative.length}` : "";
    return `${preview}${extra}${negative}`;
  }, [config.description, copy.user.fallbackFocus, userProfile.focus]);
  const commonProps = { backendHealthy, loadingData, errorText, statusText, copy };
  const welcomeVisible = welcomeReady && !hasOnboardingBasics(config);
  const runDisabledReason = !backendHealthy
    ? copy.home.runBlockedBackend
    : runForm.sources.length === 0
        ? copy.home.runBlockedSources
        : "";

  return (
    <div className={showCustomTitleBar ? "desktop-root" : "desktop-root native-frame"}>
      {showCustomTitleBar ? <TitleBar backendHealthy={backendHealthy} statusText={statusText} previewBadge={copy.previewBadge} title={copy.desktopTitle} copy={copy} /> : null}
      {welcomeVisible ? (
        <WelcomeView
          copy={copy}
          appIcon={iconIDeer}
          version={APP_VERSION}
          releaseDate={RELEASE_DATE}
          config={config}
          userProfile={userProfile}
          avatars={AVATARS}
          saving={savingConfig || savingProfile}
          testingConnection={testingConnection}
          connectionTestResult={connectionTestResult}
          testingSmtpConnection={testingSmtpConnection}
          smtpTestResult={smtpTestResult}
          languagePreference={languagePreference}
          themePreference={themePreference}
          deliveryModePreference={deliveryModePreference}
          onChangeConfig={setConfig}
          onChangeUserProfile={setUserProfile}
          onChangeLanguage={setLanguagePreference}
          onChangeTheme={setThemePreference}
          onChangeDeliveryMode={setDeliveryModePreference}
          onTestConnection={handleTestConnection}
          onTestSmtpConnection={handleTestSmtpConnection}
          onComplete={completeOnboarding}
        />
      ) : null}
      <div className="desktop-shell">
        <aside className="app-sidebar">
          <div className="brand-block text-only"><div><h1>{copy.appTitle}</h1><p className="brand-subtitle">{copy.desktopTitle}</p><p className="brand-meta">{`v${APP_VERSION} · ${RELEASE_DATE}`}</p></div></div>
          <nav className="nav-stack">
            <SidebarButton icon={faHouse} label={copy.sidebar.home} active={activeView === "home"} onClick={() => setActiveView("home")} />
            <SidebarButton icon={faFire} label={copy.sidebar.swipe} active={activeView === "swipe"} onClick={() => setActiveView("swipe")} />
            <SidebarButton icon={faFolderOpen} label={copy.sidebar.library} active={activeView === "library"} onClick={() => setActiveView("library")} />
          </nav>
          <div className="sidebar-footer">
            <div className="user-dock">
              <section className="sidebar-panel sidebar-status-panel">
                <div className="sidebar-status-header">
                  <strong>{copy.sidebar.status}</strong>
                  <button type="button" className="sidebar-status-link" onClick={() => void hydrate()}>
                    {copy.home.refresh}
                  </button>
                </div>
                <div className="sidebar-status-list">
                  <div className="sidebar-status-item">
                    <span>{copy.home.backend}</span>
                    <strong>{backendHealthy ? copy.home.online : copy.home.offline}</strong>
                  </div>
                  <div className="sidebar-status-item">
                    <span>{copy.workbench.receiver}</span>
                    <strong>{sidebarReceiver}</strong>
                  </div>
                  <div className="sidebar-status-item">
                    <span>{copy.workbench.deliveryMode}</span>
                    <strong>{sidebarDeliveryMode}</strong>
                  </div>
                </div>
                {!backendHealthy && isTauriDesktop() ? (
                  <button type="button" className="secondary-action sidebar-status-action" onClick={() => void handleStartBackend()} disabled={startingBackend}>
                    {startingBackend ? copy.home.startingBackend : copy.home.startBackend}
                  </button>
                ) : null}
              </section>
              <button type="button" className="user-card" onClick={() => openControlPanel("profile")}>
                <img src={avatarMap[userProfile.avatar]} alt={sidebarName} className="user-avatar" />
                <span className="user-meta">
                  <strong>{sidebarName}</strong>
                  <span>{interestSummary}</span>
                </span>
                <span className="menu-button inline" aria-hidden="true"><FontAwesomeIcon icon={faBars} /></span>
              </button>
            </div>
          </div>
        </aside>

        <main className="workspace">
          {activeView === "home" && <HomeView {...commonProps} config={config} recentHistory={history.slice(0, 5)} sources={sources} comingSoonSources={comingSoonSources} startingBackend={startingBackend} runForm={runForm} runState={runState} logs={logs} runFiles={runFiles} historyLoading={historyLoading} runDisabledReason={runDisabledReason} savingInterestDescription={savingInterestDescription} onOpenSettings={() => openControlPanel("preferences")} onRefresh={hydrate} onRun={runWorkflow} onRefreshHistory={refreshHistoryList} onStartBackend={handleStartBackend} onStopBackend={handleStopBackend} onOpenHistory={openHistory} onSaveInterestDescription={persistInterestDescription} onToggleSource={(source) => setRunForm((prev) => ({ ...prev, sources: prev.sources.includes(source) ? prev.sources.filter((item) => item !== source) : [...prev.sources, source] }))} onChangeRunForm={(key, value) => setRunForm((prev) => ({ ...prev, [key]: value }))} />}
          {activeView === "library" && <LibraryView backendHealthy={backendHealthy} history={history} selectedResult={selectedResult} historyLoading={historyLoading} onRefresh={refreshHistoryList} onSelect={openHistory} copy={copy} />}
          {activeView === "swipe" && <SwipeView backendHealthy={backendHealthy} copy={copy} onOpenUrl={(url) => openExternalUrl(url)} />}
        </main>

        <button
          className="floating-star-button"
          title={copy.info.github}
          onClick={() => openExternalUrl(aboutInfo.github_url || meta?.github_url || DEFAULT_ABOUT_INFO.github_url)}
        >
          <span>{copy.info.star}</span>
          <FontAwesomeIcon icon={faStar} />
        </button>

        {!welcomeVisible && controlPanel === "settings" ? <ControlCenter
          panel="settings"
          initialTab={settingsTab}
          onClose={() => setControlPanel("none")}
          userProfile={userProfile}
          avatars={AVATARS}
          backendHealthy={backendHealthy}
          startingBackend={startingBackend}
          statusText={statusText}
          config={config}
          savingConfig={savingConfig}
          savingProfile={savingProfile}
          onChangeConfig={setConfig}
          onChangeUserProfile={setUserProfile}
          onSave={persistConfig}
          onTestConnection={handleTestConnection}
          onSaveProfile={persistUserProfile}
          onStartBackend={handleStartBackend}
          onStopBackend={handleStopBackend}
          onRefresh={hydrate}
          copy={copy}
          appIcon={iconIDeer}
          version={APP_VERSION}
          releaseDate={RELEASE_DATE}
          githubUrl={aboutInfo.github_url || meta?.github_url || DEFAULT_ABOUT_INFO.github_url}
          contributors={aboutInfo.contributors}
          fallbackContributorAvatar={avatar3}
          testingConnection={testingConnection}
          connectionTestResult={connectionTestResult}
          testingSmtpConnection={testingSmtpConnection}
          smtpTestResult={smtpTestResult}
          languagePreference={languagePreference}
          themePreference={themePreference}
          deliveryModePreference={deliveryModePreference}
          onChangeLanguage={setLanguagePreference}
          onChangeTheme={setThemePreference}
          onChangeDeliveryMode={setDeliveryModePreference}
          onTestSmtpConnection={handleTestSmtpConnection}
        /> : null}
      </div>
    </div>
  );
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function resolveStatusText(copy: typeof COPY.zh | typeof COPY.en, status: StatusState) {
  switch (status.kind) {
    case "connecting":
      return copy.statusConnecting;
    case "waitingDesktop":
      return copy.statusWaitingDesktop;
    case "waitingWeb":
      return copy.statusWaitingWeb;
    case "connected":
      return copy.statusConnected;
    case "backendStarted":
      return copy.statusBackendStarted;
    case "backendStopped":
      return copy.statusBackendStopped;
    case "configSaved":
      return status.localOnly ? copy.statusConfigSavedLocal : copy.statusConfigSaved;
    case "profileSaved":
      return copy.settings.profileSaved;
    case "runDone":
      return copy.statusRunDone(status.date);
    case "runExited":
      return copy.statusRunExited;
    case "socketError":
      return copy.statusSocketError;
    default:
      return copy.statusConnecting;
  }
}

function getErrorMessage(error: unknown, copy: typeof COPY.zh | typeof COPY.en) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object") {
    const maybeMessage = Reflect.get(error, "message");
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage;
    }
    const maybeError = Reflect.get(error, "error");
    if (typeof maybeError === "string" && maybeError.trim()) {
      return maybeError;
    }
    const maybeCode = Reflect.get(error, "code");
    try {
      return JSON.stringify(
        {
          ...(typeof maybeCode === "string" || typeof maybeCode === "number" ? { code: maybeCode } : {}),
          ...(maybeMessage ? { message: maybeMessage } : {}),
          ...(maybeError ? { error: maybeError } : {}),
          raw: error,
        },
        null,
        2,
      );
    } catch {
      // fall through
    }
  }
  return copy.common.unknownError;
}

function readPreference<T extends string>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  const value = window.localStorage.getItem(key) as T | null;
  return value ?? fallback;
}

function readJsonPreference<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  const value = window.localStorage.getItem(key);
  if (!value) {
    return fallback;
  }
  try {
    return { ...fallback, ...JSON.parse(value) } as T;
  } catch {
    return fallback;
  }
}

function normalizeUserProfile(profile: UserProfile): UserProfile {
  const validAvatars = new Set<AvatarId>(["0", "1", "2", "3"]);
  return {
    ...profile,
    self_profile: profile.self_profile ?? "",
    avatar: validAvatars.has(profile.avatar) ? profile.avatar : "1",
  };
}
