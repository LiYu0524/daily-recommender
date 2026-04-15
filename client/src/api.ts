import type {
  AboutInfo,
  ConfigData,
  HistoryEntry,
  PublicMeta,
  ResultSet,
  RunMessage,
  RunRequest,
  SwipeQueueResponse,
  SwipeStats,
} from "./types";

const apiBase = import.meta.env.VITE_API_BASE?.replace(/\/$/, "") ?? "";

export function buildUrl(path: string) {
  return `${apiBase}${path}`;
}

function buildHttpUrl(path: string) {
  return `${apiBase}${path}`;
}

// --- User session ---
const USER_STORAGE_KEY = "ideer_user";

export function getStoredUser(): { userId: string; email: string } | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setStoredUser(userId: string, email: string) {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ userId, email }));
}

export function clearStoredUser() {
  localStorage.removeItem(USER_STORAGE_KEY);
}

function userHeaders(): Record<string, string> {
  const user = getStoredUser();
  return user?.userId ? { "X-User-Id": user.userId } : {};
}

function fetchWithUser(url: string, init?: RequestInit): Promise<Response> {
  const headers = { ...userHeaders(), ...(init?.headers || {}) };
  return fetch(url, { ...init, headers });
}

export async function loginWithEmail(email: string): Promise<{ user_id: string; email: string; needs_setup: boolean }> {
  const res = await fetch(buildHttpUrl("/api/auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await readJson<{ user_id: string; email: string; needs_setup: boolean }>(res);
  setStoredUser(data.user_id, data.email);
  return data;
}

export async function getUserDescription(): Promise<string> {
  const res = await fetchWithUser(buildHttpUrl("/api/user/description"));
  const data = await readJson<{ description: string }>(res);
  return data.description;
}

export async function saveUserDescription(description: string): Promise<void> {
  await fetchWithUser(buildHttpUrl("/api/user/description"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
}

function buildWsUrl(path: string) {
  if (apiBase) {
    return `${apiBase.replace(/^http/, "ws")}${path}`;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}

function buildAssetUrl(path: string) {
  const base = import.meta.env.BASE_URL ?? "/";
  return `${base.replace(/\/?$/, "/")}${path.replace(/^\//, "")}`;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

export async function getPublicMeta() {
  const response = await fetch(buildHttpUrl("/api/public/meta"));
  return readJson<PublicMeta>(response);
}

export async function getAboutInfo() {
  const response = await fetch(buildAssetUrl("/about.json"));
  return readJson<AboutInfo>(response);
}

export async function testOpenAICompatibleApi(payload: {
  baseUrl: string;
  apiKey: string;
  model?: string;
}) {
  const baseUrl = payload.baseUrl.trim().replace(/\/+$/, "");
  const apiKey = payload.apiKey.trim();
  const model = payload.model?.trim();

  if (!baseUrl) {
    throw new Error("请先填写 Base URL。");
  }
  if (!apiKey) {
    throw new Error("请先填写 API Key。");
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  try {
    const modelsResponse = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers,
    });

    if (modelsResponse.ok) {
      const data = await modelsResponse.json().catch(() => null) as { data?: Array<unknown> } | null;
      const count = Array.isArray(data?.data) ? data.data.length : null;
      return {
        ok: true,
        message: count === null ? "连接成功，/models 可访问。" : `连接成功，/models 可访问，发现 ${count} 个模型。`,
      };
    }

    if ((modelsResponse.status !== 404 && modelsResponse.status !== 405) || !model) {
      const detail = await modelsResponse.text();
      throw new Error(formatProbeError(modelsResponse.status, detail));
    }
  } catch (error) {
    if (!model) {
      throw normalizeProbeError(error);
    }
  }

  try {
    const chatResponse = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "hello" }],
        max_tokens: 1,
        temperature: 0,
      }),
    });

    if (!chatResponse.ok) {
      const detail = await chatResponse.text();
      throw new Error(formatProbeError(chatResponse.status, detail));
    }

    return {
      ok: true,
      message: "连接成功，最小 chat/completions 请求已通过。",
    };
  } catch (error) {
    throw normalizeProbeError(error);
  }
}

export async function getConfig() {
  const response = await fetch(buildHttpUrl("/api/config"));
  return readJson<ConfigData>(response);
}

export async function saveConfig(payload: ConfigData) {
  const response = await fetch(buildHttpUrl("/api/config"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return readJson<{ status: string; message?: string }>(response);
}

export async function getHistory() {
  const response = await fetch(buildHttpUrl("/api/history"));
  return readJson<HistoryEntry[]>(response);
}

export async function getResults(source: string, date: string) {
  const response = await fetch(buildHttpUrl(`/api/results/${source}/${date}`));
  return readJson<ResultSet>(response);
}

export async function checkHealth() {
  const response = await fetch(buildHttpUrl("/health"));
  return readJson<{ status: string }>(response);
}

export function openRunSocket(
  payload: RunRequest,
  handlers: {
    onMessage: (message: RunMessage) => void;
    onClose?: () => void;
    onError?: () => void;
  },
) {
  const socket = new WebSocket(buildWsUrl("/ws/run"));

  socket.onopen = () => {
    socket.send(JSON.stringify(payload));
  };

  socket.onmessage = (event) => {
    handlers.onMessage(JSON.parse(event.data) as RunMessage);
  };

  socket.onclose = () => {
    handlers.onClose?.();
  };

  socket.onerror = () => {
    handlers.onError?.();
  };

  return socket;
}

// --- Swipe (PaperTinder) ---

export async function getSwipeQueue(sources: string[] = [], days: number = 7, limit: number = 50): Promise<SwipeQueueResponse> {
  const params = new URLSearchParams();
  if (sources.length) params.set("sources", sources.join(","));
  params.set("days", String(days));
  params.set("limit", String(limit));
  const res = await fetchWithUser(buildHttpUrl(`/api/swipe/queue?${params}`));
  return readJson(res);
}

export async function sendSwipeFeedback(url: string, action: "like" | "dislike" | "skip", source = "", title = ""): Promise<{ status: string; stats: SwipeStats }> {
  const res = await fetchWithUser(buildHttpUrl("/api/swipe/feedback"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, action, source, title }),
  });
  return readJson(res);
}

export async function getSwipeStats(): Promise<SwipeStats> {
  const res = await fetchWithUser(buildHttpUrl("/api/swipe/stats"));
  return readJson(res);
}

export async function applySwipeFeedback(): Promise<{ status: string; positive: string[]; negative: string[] }> {
  const res = await fetchWithUser(buildHttpUrl("/api/swipe/apply-feedback"), { method: "POST" });
  return readJson(res);
}

export async function syncSwipeToZotero(collection = "iDeer Liked"): Promise<{ status: string; synced: number; failed: number; skipped: number }> {
  const res = await fetchWithUser(buildHttpUrl(`/api/swipe/sync-zotero?collection=${encodeURIComponent(collection)}`), { method: "POST" });
  return readJson(res);
}

function normalizeProbeError(error: unknown) {
  if (error instanceof Error) {
    return error;
  }
  return new Error("连通性测试失败，请检查地址、密钥和网络。");
}

function formatProbeError(status: number, detail: string) {
  const clean = detail.trim().replace(/\s+/g, " ");
  return clean ? `请求失败 (${status}): ${clean.slice(0, 180)}` : `请求失败 (${status})。`;
}
