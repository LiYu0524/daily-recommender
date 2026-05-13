import type { PublicMeta } from '../../../lib/types';
import { SourceCard } from './SourceCard';

const SOURCES = ['github', 'huggingface', 'twitter', 'arxiv', 'semanticscholar'];

interface SourceSelectionProps {
  selectedSources: Set<string>;
  meta: PublicMeta;
  onToggle: (source: string) => void;
}

export function SourceSelection({
  selectedSources,
  meta,
  onToggle,
}: SourceSelectionProps) {
  return (
    <section className="glass-panel rounded-[2rem] border border-white/70 p-6 shadow-panel md:p-7">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-slate-400">
            数据源
          </p>
          <h3 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-ink">
            这次想看哪些来源
          </h3>
        </div>
        <p className="text-sm leading-7 text-slate-500">
          勾选后会整理成一封邮件统一发出。
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {SOURCES.map((source) => (
          <SourceCard
            key={source}
            source={source}
            active={selectedSources.has(source)}
            disabled={source === 'twitter' && !meta.twitter_enabled}
            onClick={() => onToggle(source)}
          />
        ))}
      </div>
    </section>
  );
}
