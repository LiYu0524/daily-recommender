import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DeliveryMode,
  RunFile,
  RunRequest,
  WsMessage,
} from '../../lib/types';
import { updateProgress } from '../../lib/utils';
import { useToast } from '../../hooks/useToast';
import { useMeta } from './hooks/useMeta';
import { useWebSocket } from '../../hooks/useWebSocket';
import { Toast } from '../../components/Toast';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { MailWarning } from './components/MailWarning';
import { SendForm } from './components/SendForm';
import { SourceSelection } from './components/SourceSelection';
import { RunProgress } from './components/RunProgress';
import { ResultPanel } from './components/ResultPanel';

export function PublicPage() {
  const { meta } = useMeta();
  const { showToast } = useToast();
  const ws = useWebSocket('/ws/run');

  const [mode, setMode] = useState<'quick' | 'custom'>('quick');
  const [modeKey, setModeKey] = useState(0);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('combined_report');
  const [selectedSources, setSelectedSources] = useState<Set<string>>(
    () => new Set(['github', 'huggingface']),
  );
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('初始化');
  const [files, setFiles] = useState<RunFile[]>([]);
  const [date, setDate] = useState('');
  const [showResults, setShowResults] = useState(false);

  const progressRef = useRef(10);

  // Apply meta changes (remove twitter if not enabled)
  useEffect(() => {
    if (!meta.twitter_enabled) {
      setSelectedSources((prev) => {
        const next = new Set(prev);
        next.delete('twitter');
        return next;
      });
    }
  }, [meta.twitter_enabled]);

  const toggleSource = useCallback(
    (source: string) => {
      if (source === 'twitter' && !meta.twitter_enabled) {
        showToast('后台尚未配置 Twitter/X API，暂时无法启用这个数据源。', 'warning');
        return;
      }
      setSelectedSources((prev) => {
        const next = new Set(prev);
        if (next.has(source)) next.delete(source);
        else next.add(source);
        return next;
      });
    },
    [meta.twitter_enabled, showToast],
  );

  const cleanupRun = useCallback(() => {
    ws.close();
  }, [ws]);

  const runWithWebSocket = useCallback(
    (request: RunRequest) => {
      if (ws.isRunning) return;
      setLogs([]);
      setProgress(4);
      progressRef.current = 4;
      setStatusText('连接中');
      setShowResults(false);

      const socket = ws.connect()!;

      socket.onopen = () => {
        ws.send(request);
      };

      ws.listen((event) => {
        const data: WsMessage = JSON.parse(event.data);

        if (data.type === 'start') {
          setStatusText('开始运行');
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
          setStatusText(data.success ? '发送完成' : '执行失败');
          showToast(
            data.success ? 'Daily Trend 已生成并发出。' : '任务执行失败。',
            data.success ? 'success' : 'error',
          );
          if (data.files) {
            setFiles(data.files);
            setDate(data.date);
            setShowResults(true);
          }
          cleanupRun();
          return;
        }

        if (data.type === 'error') {
          setLogs((prev) => [...prev, `Error: ${data.message}`]);
          setStatusText('错误');
          showToast(data.message, 'error');
          cleanupRun();
        }
      });
    },
    [ws, showToast, cleanupRun],
  );

  const submitRun = useCallback(
    (request: RunRequest) => {
      if (!meta.mail_enabled) {
        showToast('服务器还没有配置发件邮箱，请先去 Admin 页面配置 SMTP。', 'warning');
        return;
      }
      if (request.sources.length === 0) {
        showToast('请至少选择一个数据源。', 'warning');
        return;
      }
      if (!request.receiver) {
        showToast('请输入接收邮箱。', 'warning');
        return;
      }
      const scholarLines = (request.scholar_urls || '')
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (scholarLines.some((u) => !/^https?:\/\//i.test(u))) {
        showToast('每个 Google Scholar 链接需要以 http:// 或 https:// 开头。', 'warning');
        return;
      }

      runWithWebSocket(request);
    },
    [meta.mail_enabled, showToast, runWithWebSocket],
  );

  const handleQuickSend = useCallback(
    (email: string) => {
      submitRun({
        sources: Array.from(selectedSources),
        save: true,
        receiver: email,
        description: '',
        scholar_urls: '',
        x_accounts_input: '',
        delivery_mode: deliveryMode,
      });
    },
    [selectedSources, deliveryMode, submitRun],
  );

  const handleCustomSend = useCallback(
    (data: {
      email: string;
      description: string;
      scholarUrls: string;
      xAccountsInput: string;
    }) => {
      submitRun({
        sources: Array.from(selectedSources),
        save: true,
        receiver: data.email,
        description: data.description,
        scholar_urls: data.scholarUrls,
        x_accounts_input: data.xAccountsInput,
        delivery_mode: deliveryMode,
      });
    },
    [selectedSources, deliveryMode, submitRun],
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-white/60 to-transparent" />

      <Header
        mode={mode}
        onModeChange={(m) => { setMode(m); setModeKey((k) => k + 1); }}
        meta={meta}
      />

      <main
        className="mx-auto max-w-6xl px-4 py-10 md:px-8 md:py-14"
      >
        <section key={modeKey} className="page-enter space-y-6">
          <HeroSection />

          <MailWarning visible={!meta.mail_enabled} />

          <SendForm
            mode={mode}
            deliveryMode={deliveryMode}
            selectedSources={selectedSources}
            meta={meta}
            isRunning={ws.isRunning}
            onDeliveryModeChange={setDeliveryMode}
            onQuickSend={handleQuickSend}
            onCustomSend={handleCustomSend}
          />

          <SourceSelection
            selectedSources={selectedSources}
            meta={meta}
            onToggle={toggleSource}
          />

          <RunProgress
            logs={logs}
            progress={progress}
            statusText={statusText}
            visible={ws.isRunning || logs.length > 0}
          />

          <ResultPanel
            files={files}
            date={date}
            visible={showResults}
            onClose={() => setShowResults(false)}
          />
        </section>
      </main>

      <Toast />
    </>
  );
}
