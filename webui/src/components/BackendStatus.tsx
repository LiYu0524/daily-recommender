import { useBackendHealth } from '../pages/public/hooks/useMeta';

export function BackendStatus() {
  const { connected } = useBackendHealth();

  if (connected !== false) return null;

  return (
    <div className="fixed inset-x-0 top-16 z-50 flex justify-center px-4 pt-3">
      <div className="glass-panel flex items-center gap-2.5 rounded-2xl border border-rose-200/80 bg-rose-50/90 px-5 py-3 text-sm font-medium text-rose-700 shadow-soft backdrop-blur-xl">
        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        无法连接到后端服务，请检查服务器是否已启动
      </div>
    </div>
  );
}
