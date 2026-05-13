import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface ToastEntry {
  id: number;
  message: string;
  type: 'success' | 'warning' | 'error';
}

interface ToastContextValue {
  toasts: ToastEntry[];
  showToast: (message: string, type?: 'success' | 'warning' | 'error') => void;
  removeToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const showToast = useCallback(
    (message: string, type: 'success' | 'warning' | 'error' = 'success') => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, type }]);
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timers.current.delete(id);
      }, 2800);
      timers.current.set(id, timer);
    },
    [],
  );

  const removeToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
