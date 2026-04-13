export const SOURCE_LABELS: Record<string, string> = {
  reports: '汇总报告',
  github: 'GitHub',
  huggingface: 'HuggingFace',
  twitter: 'X / Twitter',
  arxiv: 'arXiv',
  semanticscholar: 'Semantic Scholar',
  ideas: 'Research Ideas',
};

export const SOURCE_ORDER = [
  'reports',
  'github',
  'huggingface',
  'twitter',
  'arxiv',
  'semanticscholar',
  'ideas',
];

export const DELIVERY_HINTS: Record<string, string> = {
  source_emails: '当前按来源分别发送多封邮件。',
  combined_report: '当前只发送一封跨来源汇总邮件。',
  both: '当前会先逐封发送，再补一封总汇报。',
};

export const SOURCE_META: Record<
  string,
  {
    icon: string;
    bgColor: string;
    iconColor: string;
    badge: string;
    badgeBg: string;
    badgeColor: string;
    description: string;
  }
> = {
  github: {
    icon: 'GH',
    bgColor: 'bg-slate-900',
    iconColor: 'text-white',
    badge: '趋势',
    badgeBg: 'bg-slate-100',
    badgeColor: 'text-slate-500',
    description: '开源项目、框架和工具的今日增量。',
  },
  huggingface: {
    icon: 'HF',
    bgColor: 'bg-amber-300',
    iconColor: 'text-amber-950',
    badge: '模型 / 论文',
    badgeBg: 'bg-amber-50',
    badgeColor: 'text-amber-700',
    description: '模型、论文和社区热度变化。',
  },
  twitter: {
    icon: 'X',
    bgColor: 'bg-black',
    iconColor: 'text-white',
    badge: '可选',
    badgeBg: 'bg-slate-100',
    badgeColor: 'text-slate-500',
    description: '账号池动态，或按兴趣做一次性发现。',
  },
  arxiv: {
    icon: 'Ax',
    bgColor: '',
    iconColor: 'text-white',
    badge: '可选',
    badgeBg: 'bg-slate-100',
    badgeColor: 'text-slate-500',
    description: '按你的兴趣筛选当天值得看的论文。',
  },
  semanticscholar: {
    icon: 'SS',
    bgColor: '',
    iconColor: 'text-white',
    badge: '可选',
    badgeBg: 'bg-slate-100',
    badgeColor: 'text-slate-500',
    description: '跨期刊学术论文，WoS 替代方案。',
  },
};

// --- Admin history constants ---

export const TYPE_COLORS: Record<string, string> = {
  github: 'bg-slate-800',
  huggingface: 'bg-yellow-500',
  twitter: 'bg-black',
  arxiv: 'bg-red-700',
  semanticscholar: 'bg-purple-600',
  report: 'bg-emerald-600',
  ideas: 'bg-orange-500',
  daily: 'bg-blue-500',
};

export const TYPE_ICONS: Record<string, string> = {
  github: 'GH',
  huggingface: 'HF',
  twitter: 'X',
  arxiv: 'Ax',
  semanticscholar: 'SS',
  report: 'R',
  ideas: 'I',
  daily: 'D',
};

export const TYPE_LABELS: Record<string, string> = {
  github: 'GitHub 推荐',
  huggingface: 'HuggingFace 推荐',
  twitter: 'Twitter 推荐',
  arxiv: 'arXiv 论文',
  semanticscholar: 'Semantic Scholar',
  report: '综合报告',
  ideas: '研究想法',
  daily: '每日推荐',
};

export const ADMIN_SOURCES = ['github', 'huggingface', 'twitter', 'arxiv', 'semanticscholar'] as const;
