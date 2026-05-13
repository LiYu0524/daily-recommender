import { useCallback, useRef, useState } from 'react';
import type { AdminRunRequest, RunFile, WsMessage } from '../../../lib/types';
import { updateProgress } from '../../../lib/utils';
import { useWebSocket } from '../../../hooks/useWebSocket';

export function useRunState() {
  const ws = useWebSocket('/ws/run');
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [files, setFiles] = useState<RunFile[]>([]);
  const [visible, setVisible] = useState(false);
  const progressRef = useRef(10);

  const run = useCallback(
    (request: AdminRunRequest) => {
      if (ws.isRunning) return;
      setLogs([]);
      setProgress(4);
      progressRef.current = 4;
      setStatusText('连接中');
      setVisible(true);
      setFiles([]);

      const socket = ws.connect()!;

      socket.onopen = () => {
        ws.send(request);
      };

      ws.listen((event) => {
        const data: WsMessage = JSON.parse(event.data);

        if (data.type === 'start') {
          setStatusText('运行中...');
          setProgress(10);
          progressRef.current = 10;
          return;
        }

        if (data.type === 'log') {
          setLogs((prev) => [...prev, data.message]);
          const newWidth = Math.max(progressRef.current, updateProgress(data.message));
          progressRef.current = Math.min(newWidth, 96);
          setProgress(progressRef.current);
          setStatusText(
            data.message.length > 18
              ? `${data.message.slice(0, 18)}...`
              : data.message,
          );
          return;
        }

        if (data.type === 'complete') {
          setProgress(100);
          setStatusText(data.success ? '完成' : '失败');
          if (data.files) {
            setFiles(data.files);
          }
          ws.close();
          return;
        }

        if (data.type === 'error') {
          setLogs((prev) => [...prev, `Error: ${data.message}`]);
          setStatusText('错误');
          ws.close();
        }
      });
    },
    [ws],
  );

  const cancel = useCallback(() => {
    ws.close();
  }, [ws]);

  const dismiss = useCallback(() => {
    setVisible(false);
  }, []);

  return {
    run,
    cancel,
    dismiss,
    isRunning: ws.isRunning,
    logs,
    progress,
    statusText,
    files,
    visible,
  };
}
