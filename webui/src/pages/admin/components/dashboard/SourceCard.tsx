import type { AdminConfig } from '../../../../lib/types';
import { SOURCE_META, SOURCE_LABELS } from '../../../../lib/constants';

interface AdminSourceCardProps {
  source: string;
  selected: boolean;
  config: AdminConfig;
  onClick: () => void;
}

function getConfigSummary(source: string, config: AdminConfig): { label: string; value: string }[] {
  switch (source) {
    case 'github':
      return [
        { label: '语言', value: config.gh_languages || 'All' },
        { label: '时间', value: config.gh_since || 'Daily' },
      ];
    case 'huggingface':
      return [
        { label: '内容', value: config.hf_content_types?.join(', ') || 'Papers, Models' },
        { label: '数量', value: `${config.hf_max_papers} papers / ${config.hf_max_models} models` },
      ];
    case 'twitter': {
      const count = (config.x_accounts || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean).length;
      return [{ label: '账号', value: `${count} 配置` }];
    }
    case 'arxiv':
      return [
        { label: '分类', value: config.arxiv_categories || 'cs.AI' },
        { label: '数量', value: `${config.arxiv_max_papers} papers` },
      ];
    case 'semanticscholar':
      return [{ label: '数量', value: `${config.ss_max_papers} papers` }];
    default:
      return [];
  }
}

export function AdminSourceCard({ source, selected, config, onClick }: AdminSourceCardProps) {
  const meta = SOURCE_META[source];
  if (!meta) return null;

  const summary = getConfigSummary(source, config);
  const isSpecialColor = source === 'arxiv' || source === 'semanticscholar';
  const inlineBg =
    source === 'arxiv'
      ? { backgroundColor: '#b31b1b' }
      : source === 'semanticscholar'
        ? { backgroundColor: '#6c3ec1' }
        : undefined;

  return (
    <div
      className="admin-source-card glass-panel rounded-2xl border border-slate-200/80 p-5"
      data-selected={selected}
      onClick={onClick}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold ${isSpecialColor ? 'text-white' : `${meta.bgColor} ${meta.iconColor}`}`}
            style={isSpecialColor ? inlineBg : undefined}
          >
            {meta.icon}
          </div>
          <div>
            <h4 className="font-semibold text-slate-800">{SOURCE_LABELS[source] || source}</h4>
            <p className="text-xs text-slate-500">
              {source === 'twitter'
                ? '关注账号动态'
                : source === 'arxiv'
                  ? '每日最新论文'
                  : source === 'semanticscholar'
                    ? '跨期刊论文 (WoS 替代)'
                    : source === 'huggingface'
                      ? '论文与模型'
                      : 'Trending 仓库'}
            </p>
          </div>
        </div>
        <input
          type="checkbox"
          checked={selected}
          readOnly
          className="h-5 w-5 rounded-md border-slate-300 accent-emerald-600"
        />
      </div>
      <div className="space-y-2 text-sm text-slate-600">
        {summary.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{item.label}</span>
            <span className="text-xs">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
