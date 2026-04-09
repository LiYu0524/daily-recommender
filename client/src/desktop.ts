import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ConfigData, UserProfile } from "./types";
import type { LanguagePreference, ThemePreference } from "./copy";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauriDesktop() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function startManagedBackend() {
  if (!isTauriDesktop()) {
    return "browser-preview";
  }
  return invoke<string>("start_backend");
}

export async function stopManagedBackend() {
  if (!isTauriDesktop()) {
    return;
  }
  await invoke("stop_backend");
}

export async function readManagedBackendLog() {
  if (!isTauriDesktop()) {
    return "";
  }
  return invoke<string>("read_backend_log");
}

export async function testSmtpConnection(host: string, port: number) {
  if (!isTauriDesktop()) {
    throw new Error("SMTP 连通性测试仅支持桌面客户端。");
  }
  return invoke<string>("test_smtp_connection", { host, port });
}

export async function minimizeWindow() {
  if (!isTauriDesktop()) {
    return;
  }
  await getCurrentWindow().minimize();
}

export async function toggleWindowMaximize() {
  if (!isTauriDesktop()) {
    return;
  }
  await getCurrentWindow().toggleMaximize();
}

export async function isWindowMaximized() {
  if (!isTauriDesktop()) {
    return false;
  }
  return getCurrentWindow().isMaximized();
}

export async function openControlPanelWindow(tab: "profile" | "preferences" | "subscriptions" | "mail" | "info" = "profile") {
  if (!isTauriDesktop()) {
    return null;
  }

  const current = getCurrentWindow();
  const existing = await WebviewWindow.getByLabel("control-center");
  if (existing) {
    await existing.close();
  }

  const position = await current.outerPosition();
  const size = await current.outerSize();
  const dimensions = panelWindowDimensions(tab);
  const x = Math.round(position.x + (size.width - dimensions.width) / 2);
  const y = Math.round(position.y + (size.height - dimensions.height) / 2);

  await current.setEnabled(false);

  const url = new URL(window.location.href);
  url.searchParams.set("window", "panel");
  url.searchParams.set("tab", tab);

  const child = new WebviewWindow("control-center", {
    url: url.toString(),
    title: "iDeer",
    width: dimensions.width,
    height: dimensions.height,
    minWidth: dimensions.width,
    minHeight: dimensions.height,
    x,
    y,
    center: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    closable: true,
    focus: true,
    alwaysOnTop: true,
    decorations: true,
    skipTaskbar: true,
    parent: current,
    shadow: true,
  });

  const restoreParent = async () => {
    try {
      await current.setEnabled(true);
      await current.setFocus();
    } catch {
      // ignore if the parent window no longer exists
    }
  };

  child.once("tauri://destroyed", () => {
    void restoreParent();
  }).catch(() => {
    void restoreParent();
  });

  child.once("tauri://error", () => {
    void restoreParent();
  }).catch(() => {
    void restoreParent();
  });

  return child;
}

export async function closeWindow() {
  if (!isTauriDesktop()) {
    return;
  }
  await getCurrentWindow().close();
}

export function openExternalUrl(url: string) {
  if (typeof window === "undefined") {
    return;
  }
  if (isTauriDesktop()) {
    void invoke("open_external", { url }).catch(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function loadDesktopConfig() {
  if (!isTauriDesktop()) {
    return null;
  }
  const content = await invoke<string>("load_desktop_config");
  if (!content.trim()) {
    return null;
  }
  return JSON.parse(content) as ConfigData;
}

export async function saveDesktopConfig(config: ConfigData) {
  if (!isTauriDesktop()) {
    return;
  }
  await invoke("save_desktop_config", { content: JSON.stringify(config, null, 2) });
}

export async function emitPreferenceChange(payload: {
  languagePreference: LanguagePreference;
  themePreference: ThemePreference;
}) {
  if (!isTauriDesktop()) {
    return;
  }
  await emit("ideer://preferences", payload);
}

export async function emitConfigChange(config: ConfigData) {
  if (!isTauriDesktop()) {
    return;
  }
  await emit("ideer://config", config);
}

export async function emitUserProfileChange(profile: UserProfile) {
  if (!isTauriDesktop()) {
    return;
  }
  await emit("ideer://user-profile", profile);
}

export async function listenPreferenceChange(
  handler: (payload: { languagePreference: LanguagePreference; themePreference: ThemePreference }) => void,
) {
  if (!isTauriDesktop()) {
    return () => {};
  }
  return listen<{ languagePreference: LanguagePreference; themePreference: ThemePreference }>("ideer://preferences", (event) => {
    if (event.payload) {
      handler(event.payload);
    }
  });
}

export async function listenConfigChange(handler: (config: ConfigData) => void) {
  if (!isTauriDesktop()) {
    return () => {};
  }
  return listen<ConfigData>("ideer://config", (event) => {
    if (event.payload) {
      handler(event.payload);
    }
  });
}

export async function listenUserProfileChange(handler: (profile: UserProfile) => void) {
  if (!isTauriDesktop()) {
    return () => {};
  }
  return listen<UserProfile>("ideer://user-profile", (event) => {
    if (event.payload) {
      handler(event.payload);
    }
  });
}

function panelWindowDimensions(tab: "profile" | "preferences" | "subscriptions" | "mail" | "info") {
  switch (tab) {
    case "info":
      return { width: 560, height: 620 };
    case "profile":
    case "preferences":
    case "subscriptions":
    case "mail":
      return { width: 760, height: 860 };
    default:
      return { width: 760, height: 860 };
  }
}
