import type { PublicMeta, AdminConfig, HistoryEntry, ResultData } from './types';

export async function getMeta(): Promise<PublicMeta> {
  const res = await fetch('/api/public/meta');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getConfig(): Promise<AdminConfig> {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function saveConfig(config: Partial<AdminConfig>): Promise<void> {
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const res = await fetch('/api/history');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getResult(source: string, date: string): Promise<ResultData> {
  const res = await fetch(`/api/results/${source}/${date}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function createRunWebSocket(): WebSocket {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return new WebSocket(`${scheme}://${window.location.host}/ws/run`);
}
