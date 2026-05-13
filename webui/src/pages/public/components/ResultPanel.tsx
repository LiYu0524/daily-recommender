import type { RunFile } from '../../../lib/types';
import { SOURCE_LABELS, SOURCE_ORDER } from '../../../lib/constants';
import { FileCard } from './FileCard';

interface ResultPanelProps {
  files: RunFile[];
  date: string;
  visible: boolean;
  onClose: () => void;
}

export function ResultPanel({ files, date, visible, onClose }: ResultPanelProps) {
  if (!visible || files.length === 0) return null;

  const groups: Record<string, RunFile[]> = {};
  for (const file of files) {
    if (!groups[file.source]) groups[file.source] = [];
    groups[file.source].push(file);
  }

  const sortedEntries = Object.entries(groups).sort((a, b) => {
    const ai = SOURCE_ORDER.indexOf(a[0]);
    const bi = SOURCE_ORDER.indexOf(b[0]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <section className="glass-panel rounded-[2rem] border border-white/70 p-6 shadow-panel">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-slate-400">
            Results
          </p>
          <h3 className="mt-2 text-xl font-extrabold text-ink">已生成的内容</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-500 transition hover:text-ink"
        >
          收起
        </button>
      </div>
      <div className="mt-5 space-y-4">
        {sortedEntries.map(([source, items], idx) => (
          <div
            key={source}
            className="result-card-enter rounded-3xl border border-slate-200 bg-white p-4 shadow-soft"
            style={{ animationDelay: `${idx * 0.1}s` }}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
                  {date}
                </p>
                <h4 className="mt-1 text-lg font-extrabold text-ink">
                  {SOURCE_LABELS[source] || source}
                </h4>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                {items.length} 个文件
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {items.map((file, i) => (
                <FileCard key={i} file={file} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
