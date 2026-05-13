import { useToast } from '../hooks/useToast';

export function Toast() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  const styleMap = {
    success: {
      border: 'border-emerald-200',
      text: 'text-emerald-800',
      icon: (
        <svg
          className="h-4 w-4 text-emerald-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      ),
    },
    warning: {
      border: 'border-amber-200',
      text: 'text-amber-800',
      icon: (
        <svg
          className="h-4 w-4 text-amber-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
      ),
    },
    error: {
      border: 'border-rose-200',
      text: 'text-rose-800',
      icon: (
        <svg
          className="h-4 w-4 text-rose-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      ),
    },
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
      {toasts.map((toast) => {
        const s = styleMap[toast.type];
        return (
          <div
            key={toast.id}
            onClick={() => removeToast(toast.id)}
            className="animate-rise cursor-pointer rounded-2xl border bg-white px-4 py-3 text-sm font-semibold shadow-panel transition-all duration-300 hover:opacity-80"
          >
            <div
              className={`flex items-center gap-3 ${s.border}`}
            >
              {s.icon}
              <span className={s.text}>{toast.message}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
