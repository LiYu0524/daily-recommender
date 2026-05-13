import { useCallback, useEffect, useRef, useState } from 'react';
import { createRunWebSocket } from '../lib/api';

export function useWebSocket(path: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(
    (overrides?: { factory?: () => WebSocket }) => {
      if (!path) return;
      const ws = overrides?.factory?.() ?? createRunWebSocket();
      wsRef.current = ws;
      setIsRunning(true);
      setError(null);

      ws.onclose = () => {
        setIsRunning(false);
        wsRef.current = null;
      };

      ws.onerror = () => {
        setError('WebSocket 连接失败。');
        setIsRunning(false);
        wsRef.current = null;
      };

      return ws;
    },
    [path],
  );

  const send = useCallback((data: unknown) => {
    wsRef.current?.send(JSON.stringify(data));
  }, []);

  const listen = useCallback((handler: (event: MessageEvent) => void) => {
    const ws = wsRef.current;
    if (ws) ws.onmessage = handler;
  }, []);

  const close = useCallback(() => {
    wsRef.current?.close();
  }, []);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return { connect, send, listen, close, isRunning, error, wsRef };
}
