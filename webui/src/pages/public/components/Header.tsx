import { useLayoutEffect, useRef, useState } from 'react';
import type { PublicMeta } from '../../../lib/types';

interface HeaderProps {
  mode: 'quick' | 'custom';
  onModeChange: (mode: 'quick' | 'custom') => void;
  meta: PublicMeta;
}

export function Header({ mode, onModeChange, meta }: HeaderProps) {
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
    <header className="sticky top-0 z-40 border-b border-white/60 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-3">
          <img src="/icons/icon_ideer.svg" alt="iDeer" className="h-9 w-9 rounded-xl shadow-soft" />
          <h1 className="text-lg font-bold tracking-[-0.02em] text-ink">
            iDeer
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="glass-panel relative flex rounded-2xl border border-slate-200/80 p-1 shadow-soft">
            {pos.ready && (
              <span
                className="absolute top-1 rounded-xl bg-slate-900 text-white shadow-lg transition-all duration-250 ease-out"
                style={{
                  left: pos.left,
                  top: pos.top,
                  width: pos.width,
                  height: pos.height,
                }}
              />
            )}
            <button
              ref={(el) => { if (el) refs.current['quick'] = el; }}
              type="button"
              className="relative z-10 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors duration-200"
              style={{ color: mode === 'quick' ? 'white' : '#475569' }}
              onClick={() => onModeChange('quick')}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              快速版
            </button>
            <button
              ref={(el) => { if (el) refs.current['custom'] = el; }}
              type="button"
              className="relative z-10 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors duration-200"
              style={{ color: mode === 'custom' ? 'white' : '#475569' }}
              onClick={() => onModeChange('custom')}
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M10 18h4" />
              </svg>
              定制版
            </button>
          </div>

          <a
            href={meta.github_url || 'https://github.com/LiYu0524/daily-recommender'}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-soft transition hover:-translate-y-0.5 hover:border-slate-300"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12a12 12 0 008.2 11.39c.6.11.79-.26.79-.58v-2.02c-3.34.72-4.03-1.42-4.03-1.42-.54-1.39-1.33-1.76-1.33-1.76-1.09-.74.09-.72.09-.72 1.2.08 1.83 1.23 1.83 1.23 1.07 1.83 2.8 1.3 3.49 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.47-1.33-5.47-5.92 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23A11.54 11.54 0 0112 6.8c1.02 0 2.05.14 3.01.4 2.29-1.55 3.29-1.23 3.29-1.23.66 1.65.25 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.6-2.81 5.61-5.49 5.91.43.37.82 1.1.82 2.22v3.29c0 .32.19.69.8.57A12 12 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            GitHub 仓库
          </a>

          <a
            href="/admin"
            className="hidden rounded-2xl px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-white hover:text-slate-800 md:inline-flex"
          >
            后台
          </a>
        </div>
      </div>
    </header>
  );
}
