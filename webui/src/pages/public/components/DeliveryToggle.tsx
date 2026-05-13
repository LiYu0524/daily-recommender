import { useLayoutEffect, useRef, useState } from 'react';
import type { DeliveryMode } from '../../../lib/types';
import { DELIVERY_HINTS } from '../../../lib/constants';

interface DeliveryToggleProps {
  mode: DeliveryMode;
  onChange: (mode: DeliveryMode) => void;
}

const MODES: DeliveryMode[] = ['source_emails', 'combined_report', 'both'];
const LABELS: Record<DeliveryMode, string> = {
  source_emails: '逐封',
  combined_report: '合并',
  both: '两者都发',
};

export function DeliveryToggle({ mode, onChange }: DeliveryToggleProps) {
  const refs = useRef<Record<string, HTMLButtonElement>>({});
  const [pos, setPos] = useState({ left: 0, top: 0, width: 0, height: 0, ready: false });

  useLayoutEffect(() => {
    const btn = refs.current[mode];
    if (btn) {
      setPos({
        left: btn.offsetLeft,
        top: btn.offsetTop,
        width: btn.offsetWidth,
        height: btn.offsetHeight,
        ready: true,
      });
    }
  }, [mode]);

  return (
    <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="glass-panel relative inline-flex rounded-2xl border border-slate-200/80 p-1 shadow-soft">
        {pos.ready && (
          <span
            className="absolute top-1 rounded-xl bg-emerald-600 text-white shadow-lg transition-all duration-250 ease-out"
            style={{
              left: pos.left,
              top: pos.top,
              width: pos.width,
              height: pos.height,
            }}
          />
        )}
        {MODES.map((m) => (
          <button
            key={m}
            ref={(el) => { if (el) refs.current[m] = el; }}
            type="button"
            className="relative z-10 rounded-xl px-3 py-2 text-sm font-semibold transition-colors duration-200"
            style={{ color: mode === m ? 'white' : '#475569' }}
            onClick={() => onChange(m)}
          >
            {LABELS[m]}
          </button>
        ))}
      </div>
      <p className="text-sm leading-7 text-slate-500">{DELIVERY_HINTS[mode]}</p>
    </div>
  );
}
