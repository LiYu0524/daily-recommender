import type { RunFile } from '../../../../lib/types';
import { SOURCE_LABELS, SOURCE_ORDER } from '../../../../lib/constants';
import { FileCard } from '../../../public/components/FileCard';

interface AdminResultsPanelProps {
  files: RunFile[];
  visible: boolean;
  onClose: () => void;
}

export function AdminResultsPanel({ files, visible, onClose }: AdminResultsPanelProps) {
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
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">生成结果</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-200"
        >
          关闭
        </button>
      </div>
      <div className="space-y-6">
        {sortedEntries.map(([source, items], idx) => (
          <div
            key={source}
            className="result-card-enter rounded-3xl border border-slate-200 bg-white p-4 shadow-soft"
            style={{ animationDelay: `${idx * 0.1}s` }}
          >
            <div className="flex items-center justify-between gap-4">
              <h4 className="text-lg font-extrabold text-ink">
                {SOURCE_LABELS[source] || source}
              </h4>
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
