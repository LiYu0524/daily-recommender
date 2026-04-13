interface QuickActionsProps {
  disabled: boolean;
  selectedSources: Set<string>;
  hasProfile: boolean;
  onQuickRun: () => void;
  onGenerateReport: () => void;
  onGenerateIdeas: () => void;
  showToast: (message: string, type?: 'success' | 'warning' | 'error') => void;
}

export function QuickActions({
  disabled,
  selectedSources,
  hasProfile,
  onQuickRun,
  onGenerateReport,
  onGenerateIdeas,
  showToast,
}: QuickActionsProps) {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      {/* Quick Run */}
      <div className="glass-panel rounded-2xl border border-slate-200/80 p-6 shadow-soft">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
          <svg className="h-5 w-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h3 className="mb-1 font-semibold text-slate-800">快速运行</h3>
        <p className="mb-4 text-sm text-slate-500">使用当前配置立即生成推荐</p>
        <button
          type="button"
          disabled={disabled}
          onClick={onQuickRun}
          className="w-full rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          立即运行
        </button>
      </div>

      {/* Generate Report */}
      <div className="glass-panel rounded-2xl border border-slate-200/80 p-6 shadow-soft">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
          <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="mb-1 font-semibold text-slate-800">生成报告</h3>
        <p className="mb-4 text-sm text-slate-500">跨源综合分析报告</p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (selectedSources.size < 2) {
              showToast('生成报告需要至少选择 2 个信息源', 'warning');
              return;
            }
            onGenerateReport();
          }}
          className="w-full rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          生成报告
        </button>
      </div>

      {/* Generate Ideas */}
      <div className="glass-panel rounded-2xl border border-slate-200/80 p-6 shadow-soft">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50">
          <svg className="h-5 w-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <h3 className="mb-1 font-semibold text-slate-800">研究想法</h3>
        <p className="mb-4 text-sm text-slate-500">基于推荐生成研究选题</p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (!hasProfile) {
              showToast('请先在配置中填写研究者画像', 'warning');
              return;
            }
            onGenerateIdeas();
          }}
          className="w-full rounded-xl bg-orange-50 px-4 py-2.5 text-sm font-medium text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          生成想法
        </button>
      </div>
    </section>
  );
}
