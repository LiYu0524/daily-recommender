import type { HistoryEntry } from '../../../../lib/types';
import { TYPE_COLORS, TYPE_ICONS, TYPE_LABELS } from '../../../../lib/constants';

interface HistoryListProps {
  entries: HistoryEntry[];
  loading: boolean;
  onViewResult: (type: string, date: string) => void;
}

export function HistoryList({ entries, loading, onViewResult }: HistoryListProps) {
  if (loading) {
    return (
      <div className="py-12 text-center text-slate-400">
        <svg className="mx-auto mb-3 h-12 w-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>加载中...</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400">
        <svg className="mx-auto mb-3 h-12 w-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>暂无历史记录</p>
        <p className="mt-1 text-sm">运行一次推荐任务后将在此处显示</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map((item) => (
        <div
          key={item.id}
          className="history-card glass-panel cursor-pointer rounded-2xl border border-slate-200/80 p-5"
          onClick={() => onViewResult(item.type, item.date)}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold tracking-wider text-white ${TYPE_COLORS[item.type] || 'bg-slate-500'}`}
              >
                {TYPE_ICONS[item.type] || '?'}
              </div>
              <div>
                <h4 className="font-semibold text-slate-800">{TYPE_LABELS[item.type] || item.type}</h4>
                <p className="mt-0.5 text-xs text-slate-500">{item.date}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(item.sources || []).map((s) => (
                <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                  {s}
                </span>
              ))}
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                {item.items || '-'} 项
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
