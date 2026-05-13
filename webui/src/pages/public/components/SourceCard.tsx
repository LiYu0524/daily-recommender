import { SOURCE_META, SOURCE_LABELS } from '../../../lib/constants';

interface SourceCardProps {
  source: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}

export function SourceCard({ source, active, disabled, onClick }: SourceCardProps) {
  const meta = SOURCE_META[source];
  if (!meta) return null;

  const isSpecialColor = source === 'arxiv' || source === 'semanticscholar';
  const inlineBg =
    source === 'arxiv'
      ? { backgroundColor: '#b31b1b' }
      : source === 'semanticscholar'
        ? { backgroundColor: '#6c3ec1' }
        : undefined;

  const twitterDisabledBadge = source === 'twitter' && disabled;

  return (
    <button
      type="button"
      className="source-pill rounded-2xl border border-slate-200 bg-white px-4 py-5 text-left shadow-soft"
      data-active={active}
      data-disabled={disabled}
      onClick={onClick}
      disabled={disabled}
    >
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl text-xs font-extrabold tracking-[0.2em] ${isSpecialColor ? meta.iconColor : `${meta.bgColor} ${meta.iconColor}`}`}
          style={isSpecialColor ? inlineBg : undefined}
        >
          {meta.icon}
        </span>
        <span
          className={`rounded-full px-2 py-1 text-[11px] font-semibold ${twitterDisabledBadge ? 'bg-amber-50 text-amber-700' : `${meta.badgeBg} ${meta.badgeColor}`}`}
        >
          {twitterDisabledBadge ? '后台未配置' : meta.badge}
        </span>
      </div>
      <h4 className="mt-4 text-[17px] font-bold tracking-[-0.02em] text-ink">
        {SOURCE_LABELS[source] || source}
      </h4>
      <p className="mt-2 text-[15px] leading-7">{meta.description}</p>
    </button>
  );
}
