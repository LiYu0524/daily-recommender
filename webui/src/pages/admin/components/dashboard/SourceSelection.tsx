import type { AdminConfig } from '../../../../lib/types';
import { ADMIN_SOURCES } from '../../../../lib/constants';
import { AdminSourceCard } from './SourceCard';

interface AdminSourceSelectionProps {
  selectedSources: Set<string>;
  config: AdminConfig;
  onToggle: (source: string) => void;
}

export function AdminSourceSelection({ selectedSources, config, onToggle }: AdminSourceSelectionProps) {
  return (
    <section>
      <h3 className="mb-4 text-lg font-semibold text-slate-800">选择信息源</h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {ADMIN_SOURCES.map((source) => (
          <AdminSourceCard
            key={source}
            source={source}
            selected={selectedSources.has(source)}
            config={config}
            onClick={() => onToggle(source)}
          />
        ))}
      </div>
    </section>
  );
}
