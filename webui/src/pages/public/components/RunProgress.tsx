import { useEffect, useRef } from 'react';

interface RunProgressProps {
  logs: string[];
  progress: number;
  statusText: string;
  visible: boolean;
}

export function RunProgress({
  logs,
  progress,
  statusText,
  visible,
}: RunProgressProps) {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (!visible) return null;

  return (
    <section className="glass-panel rounded-[2rem] border border-white/70 p-6 shadow-panel">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-slate-400">
            Progress
          </p>
          <h3 className="mt-2 text-xl font-extrabold text-ink">任务执行中</h3>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {statusText}
        </span>
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sea to-cyan-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="log-view mt-4 rounded-2xl bg-slate-950 px-4 py-3 text-slate-100">
        {logs.map((msg, i) => {
          const lower = msg.toLowerCase();
          const isError =
            lower.includes('error') ||
            lower.includes('fail') ||
            lower.includes('traceback');
          const isWarn =
            lower.includes('warn') || lower.includes('skip') || lower.includes('retry');
          const isOk =
            lower.includes('done') ||
            lower.includes('success') ||
            lower.includes('complete') ||
            lower.includes('saved');
          const color = isError
            ? 'text-red-400'
            : isWarn
              ? 'text-amber-400'
              : isOk
                ? 'text-emerald-400'
                : '';
          return (
            <div key={i} className={color}>
              {msg}
            </div>
          );
        })}
        <div ref={logEndRef} />
      </div>
    </section>
  );
}
