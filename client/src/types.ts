export type SourceName = "github" | "huggingface" | "twitter" | "arxiv";
export type AvatarId = "0" | "1" | "2" | "3";

export type DeliveryMode = "source_emails" | "combined_report" | "both";

export interface PublicMeta {
  github_url: string;
  twitter_enabled: boolean;
  mail_enabled: boolean;
  arxiv_enabled: boolean;
}

export interface MainContributor {
  name: string;
  github_id: string;
  url?: string;
  website?: string;
}

export interface AboutInfo {
  github_url: string;
  contributors: MainContributor[];
}

export interface UserProfile {
  name: string;
  receiver: string;
  focus: string;
  avatar: AvatarId;
}

export interface ConfigData {
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
  x_rapidapi_host: string;
  x_accounts: string;
  arxiv_categories: string;
  arxiv_max_entries: number;
  arxiv_max_papers: number;
}

export interface RunRequest {
  sources: SourceName[];
  generate_report: boolean;
  generate_ideas: boolean;
  save: boolean;
  receiver: string;
  description: string;
  researcher_profile: string;
  scholar_url: string;
  x_accounts_input: string;
  delivery_mode: DeliveryMode;
}

export interface RunLogMessage {
  type: "start" | "log" | "error";
  message: string;
}

export interface RunCompleteMessage {
  type: "complete";
  exit_code: number;
  success: boolean;
  files: string[];
  date: string;
}

export type RunMessage = RunLogMessage | RunCompleteMessage;

export interface HistoryEntry {
  id: string;
  type: string;
  date: string;
  sources: string[];
  items: number;
  path: string;
}

export interface MarkdownResultFile {
  name: string;
  content: string;
}

export interface HtmlResultFile {
  name: string;
  url: string;
}

export interface JsonResultFile {
  name: string;
  data: unknown;
}

export interface ResultSet {
  source: string;
  date: string;
  markdown_files: MarkdownResultFile[];
  html_files: HtmlResultFile[];
  json_files: JsonResultFile[];
}
