export interface PublicMeta {
  github_url: string;
  twitter_enabled: boolean;
  mail_enabled: boolean;
}

export type DeliveryMode = 'source_emails' | 'combined_report' | 'both';

export interface RunRequest {
  sources: string[];
  save: boolean;
  receiver: string;
  description: string;
  scholar_urls: string;
  x_accounts_input: string;
  delivery_mode: DeliveryMode;
}

export interface WsStartMessage {
  type: 'start';
  message: string;
}

export interface WsLogMessage {
  type: 'log';
  message: string;
}

export interface WsCompleteMessage {
  type: 'complete';
  success: boolean;
  files: RunFile[];
  date: string;
  exit_code: number;
}

export interface WsErrorMessage {
  type: 'error';
  message: string;
}

export type WsMessage =
  | WsStartMessage
  | WsLogMessage
  | WsCompleteMessage
  | WsErrorMessage;

export interface RunFile {
  name: string;
  url: string;
  type: string;
  source: string;
  content?: string;
  items?: FileItem[];
}

export interface FileItem {
  title: string;
  summary: string;
  description: string;
  url: string;
  score: number | string;
  language: string;
  stars: string;
}

// --- Admin types ---

export interface AdminConfig {
  desktop_python_path: string;
  provider: string;
  model: string;
  base_url: string;
  api_key: string;
  temperature: number;
  smtp_server: string;
  smtp_port: number;
  sender: string;
  receiver: string;
  smtp_password: string;
  gh_languages: string;
  gh_since: string;
  gh_max_repos: number;
  hf_content_types: string[];
  hf_max_papers: number;
  hf_max_models: number;
  description: string;
  researcher_profile: string;
  x_rapidapi_key: string;
  x_accounts: string;
  arxiv_categories: string;
  arxiv_max_entries: number;
  arxiv_max_papers: number;
  ss_max_results: number;
  ss_max_papers: number;
  ss_year: string;
  ss_api_key: string;
  schedule_enabled: boolean;
  schedule_frequency: string;
  schedule_time: string;
  schedule_sources: string[];
  schedule_generate_report: boolean;
  schedule_generate_ideas: boolean;
}

export type AdminTab = 'dashboard' | 'config' | 'history';

export interface HistoryEntry {
  id: string;
  type: string;
  date: string;
  sources: string[];
  items: number;
  path: string;
}

export interface ResultFile {
  name: string;
  content?: string;
  url?: string;
  data?: unknown;
}

export interface ResultData {
  source: string;
  date: string;
  markdown_files: ResultFile[];
  html_files: ResultFile[];
  json_files: ResultFile[];
}

export interface AdminRunRequest {
  sources: string[];
  generate_report: boolean;
  generate_ideas: boolean;
  save: boolean;
}
