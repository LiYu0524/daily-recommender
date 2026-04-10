export type SourceName = "github" | "huggingface" | "twitter" | "arxiv";
export type ComingSoonSourceKey = "wos" | "cnki" | "wechat" | "scholar";
export type VisibleSourceKey = SourceName | ComingSoonSourceKey;
export type AvatarId = "0" | "1" | "2" | "3";

export type DeliveryMode = "source_emails" | "combined_report" | "both";
export type LogLevel = "progress" | "standard" | "verbose";
export type ServiceMode = "custom" | "managed";

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
  self_profile: string;
  avatar: AvatarId;
}

export interface ConfigData {
  desktop_python_path: string;
  profile_name: string;
  profile_avatar: AvatarId;
  onboarding_completed: boolean;
  model_mode: ServiceMode;
  smtp_mode: ServiceMode;
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
  user_researcher_profile: string;
  x_rapidapi_key: string;
  x_rapidapi_host: string;
  x_accounts: string;
  arxiv_categories: string;
  arxiv_max_entries: number;
  arxiv_max_papers: number;
  log_level: LogLevel;
  visible_sources: VisibleSourceKey[];
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

export interface RunOutputMarkdownFile {
  type: "markdown";
  name: string;
  content: string;
  source: string;
}

export interface RunOutputHtmlFile {
  type: "html";
  name: string;
  url: string;
  source: string;
}

export interface RunOutputJsonListFile {
  type: "json_list";
  name: string;
  items: unknown[];
  source: string;
}

export type RunOutputFile = RunOutputMarkdownFile | RunOutputHtmlFile | RunOutputJsonListFile;

export interface RunCompleteMessage {
  type: "complete";
  exit_code: number;
  success: boolean;
  files: RunOutputFile[];
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

// --- Swipe (PaperTinder) ---

export interface SwipeItem {
  title: string;
  summary: string;
  score: number;
  url: string;
  _source_type: string;
  _date: string;
  _is_today?: boolean;
  highlights?: string[];
  category?: string;
  // Source-specific (all optional)
  stars?: number;
  stars_today?: number;
  forks?: number;
  language?: string;
  upvotes?: number;
  downloads?: number;
  likes?: number;
  tags?: string[];
  authors?: string;
  venue?: string;
  citation_count?: number;
}

export interface SwipeQueueResponse {
  items: SwipeItem[];
  total_unseen: number;
  total_swiped: number;
}

export interface SwipeStats {
  liked: number;
  disliked: number;
  total: number;
}
