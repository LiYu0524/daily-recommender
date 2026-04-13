import { useCallback, useMemo, useState } from 'react';
import type { HistoryEntry } from '../../../../lib/types';
import { HistoryList } from './HistoryList';
import { ResultModal } from './ResultModal';

const FILTER_OPTIONS = [
  { value: 'all', label: '全部类型' },
  { value: 'github', label: 'GitHub' },
  { value: 'huggingface', label: 'HuggingFace' },
  { value: 'twitter', label: 'Twitter' },
  { value: 'arxiv', label: 'arXiv' },
  { value: 'semanticscholar', label: 'Semantic Scholar' },
  { value: 'report', label: '报告' },
  { value: 'ideas', label: '研究想法' },
];

interface HistoryViewProps {
  history: {
    entries: HistoryEntry[];
    loading: boolean;
    reload: () => void;
  };
  showToast: (message: string, type?: 'success' | 'warning' | 'error') => void;
}

export function HistoryView({ history, showToast }: HistoryViewProps) {
  const [filter, setFilter] = useState('all');
  const [modalState, setModalState] = useState<{ source: string; date: string } | null>(null);

  const filteredEntries = useMemo(() => {
    if (filter === 'all') return history.entries;
    return history.entries.filter(
      (h) => h.type === filter || h.sources?.includes(filter),
    );
  }, [history.entries, filter]);

  const handleViewResult = useCallback((type: string, date: string) => {
    setModalState({ source: type, date });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl text-slate-800">历史记录</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={history.reload}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition hover:bg-slate-50"
          >
            刷新
          </button>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <HistoryList
        entries={filteredEntries}
        loading={history.loading}
        onViewResult={handleViewResult}
      />

      {modalState && (
        <ResultModal
          source={modalState.source}
          date={modalState.date}
          onClose={() => setModalState(null)}
          showToast={showToast}
        />
      )}
    </div>
  );
}
