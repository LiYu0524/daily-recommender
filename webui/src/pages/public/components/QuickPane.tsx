import { useRef } from 'react';

interface QuickPaneProps {
  onSend: (email: string) => void;
  disabled: boolean;
}

export function QuickPane({ onSend, disabled }: QuickPaneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    const email = inputRef.current?.value.trim() || '';
    onSend(email);
  };

  return (
    <div className="rounded-[1.7rem] border border-white/80 bg-white/90 p-4 shadow-soft">
      <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)_auto] lg:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
            输入邮箱，收到汇总
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            输入邮箱，直接发送今日汇总。
          </p>
        </div>
        <div>
          <label
            htmlFor="quick-email"
            className="mb-2 block text-sm font-semibold text-slate-700 lg:sr-only"
          >
            邮箱
          </label>
          <input
            id="quick-email"
            ref={inputRef}
            type="email"
            placeholder="you@example.com"
            className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base outline-none transition focus:border-sea focus:ring-4 focus:ring-emerald-100"
          />
        </div>
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-ink px-6 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-55"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10l9-7 9 7-9 7-9-7z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 21l3-2 3 2" />
          </svg>
          <span>发送今日汇总</span>
        </button>
      </div>
    </div>
  );
}
