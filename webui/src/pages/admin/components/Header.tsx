import { useNavigate } from 'react-router-dom';
import type { AdminTab } from '../../../lib/types';

const TABS: { key: AdminTab; label: string }[] = [
  { key: 'dashboard', label: '控制台' },
  { key: 'config', label: '配置' },
  { key: 'history', label: '历史' },
];

interface HeaderProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  hidden?: boolean;
}

export function Header({ activeTab, onTabChange, hidden }: HeaderProps) {
  const navigate = useNavigate();

  if (hidden) return null;

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-slate-200/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回
          </button>
          <div className="h-5 w-px bg-slate-200" />
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-sm font-bold text-white">
            DR
          </div>
          <h1 className="text-lg font-semibold text-slate-800">Daily Recommender</h1>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
            Admin
          </span>
        </div>
        <nav className="flex items-center gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className="admin-tab border-b-2 border-transparent px-4 py-2 text-sm font-medium text-slate-600 transition hover:text-slate-900"
              data-active={activeTab === tab.key}
              onClick={() => onTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
