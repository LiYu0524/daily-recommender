import { useEffect, useRef } from 'react';

interface RunPanelProps {
  logs: string[];
  progress: number;
  statusText: string;
  isRunning: boolean;
  visible: boolean;
  onCancel: () => void;
  onDismiss: () => void;
  showToast: (message: string, type?: 'success' | 'warning' | 'error') => void;
}

export function RunPanel({
  logs,
  progress,
  statusText,
  isRunning,
  visible,
  onCancel,
  onDismiss,
  showToast,
}: RunPanelProps) {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (statusText === '完成') {
      showToast('运行完成', 'success');
    } else if (statusText === '失败') {
      showToast('运行失败', 'error');
    }
  }, [statusText, showToast]);

  if (!visible) return null;

  const isFinished = statusText === '完成' || statusText === '失败';

  return (
    <section>
      <div className="glass-panel rounded-2xl border border-emerald-200/80 p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`h-3 w-3 rounded-full ${isRunning ? 'animate-pulse bg-emerald-500' : isFinished && statusText === '完成' ? 'bg-emerald-500' : 'bg-red-400'}`}
            />
            <h3 className="font-semibold text-slate-800">
              {isRunning ? '正在运行' : statusText === '完成' ? '运行完成' : '运行失败'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500">{statusText || '初始化...'}</span>
            {isRunning && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg bg-slate-100 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-200"
              >
                取消
              </button>
            )}
            {!isRunning && (
              <button
                type="button"
                onClick={onDismiss}
                className="rounded-lg bg-slate-100 px-3 py-1 text-xs text-slate-600 transition hover:bg-slate-200"
              >
                关闭
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="log-view mt-3 rounded-2xl bg-slate-950 px-4 py-3 text-slate-100">
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
        </div>
      </div>
    </section>
  );
}
