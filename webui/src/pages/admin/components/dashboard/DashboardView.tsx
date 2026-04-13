import { useCallback, useState } from 'react';
import type { AdminConfig, AdminRunRequest, RunFile } from '../../../../lib/types';
import { QuickActions } from './QuickActions';
import { AdminSourceSelection } from './SourceSelection';
import { RunPanel } from './RunPanel';
import { AdminResultsPanel } from './ResultsPanel';

interface DashboardViewProps {
  config: AdminConfig;
  runState: {
    run: (request: AdminRunRequest) => void;
    cancel: () => void;
    dismiss: () => void;
    isRunning: boolean;
    logs: string[];
    progress: number;
    statusText: string;
    files: RunFile[];
    visible: boolean;
  };
  showToast: (message: string, type?: 'success' | 'warning' | 'error') => void;
}

export function DashboardView({ config, runState, showToast }: DashboardViewProps) {
  const [selectedSources, setSelectedSources] = useState<Set<string>>(() => new Set());
  const [showResults, setShowResults] = useState(false);

  const toggleSource = useCallback((source: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }, []);

  const quickRun = useCallback(() => {
    if (selectedSources.size === 0) {
      showToast('请至少选择一个信息源', 'warning');
      return;
    }
    setShowResults(false);
    runState.run({
      sources: Array.from(selectedSources),
      generate_report: false,
      generate_ideas: false,
      save: true,
    });
  }, [selectedSources, runState, showToast]);

  const generateReport = useCallback(() => {
    if (selectedSources.size < 2) {
      showToast('生成报告需要至少选择 2 个信息源', 'warning');
      return;
    }
    setShowResults(false);
    runState.run({
      sources: Array.from(selectedSources),
      generate_report: true,
      generate_ideas: false,
      save: true,
    });
  }, [selectedSources, runState, showToast]);

  const generateIdeas = useCallback(() => {
    if (!config.researcher_profile) {
      showToast('请先在配置中填写研究者画像', 'warning');
      return;
    }
    setShowResults(false);
    runState.run({
      sources: Array.from(selectedSources),
      generate_report: false,
      generate_ideas: true,
      save: true,
    });
  }, [config.researcher_profile, selectedSources, runState, showToast]);

  // Auto-show results when run completes with files
  const hasFiles = runState.files.length > 0 && !runState.isRunning && runState.visible;
  if (hasFiles && !showResults) {
    setShowResults(true);
  }

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="py-12 text-center">
        <h2 className="text-3xl font-serif text-slate-800 md:text-4xl">发现值得关注的内容</h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-500">
          从 GitHub、HuggingFace、Twitter 等来源自动采集和筛选，生成个性化推荐
        </p>
      </section>

      <QuickActions
        disabled={runState.isRunning}
        selectedSources={selectedSources}
        hasProfile={!!config.researcher_profile}
        onQuickRun={quickRun}
        onGenerateReport={generateReport}
        onGenerateIdeas={generateIdeas}
        showToast={showToast}
      />

      <AdminSourceSelection
        selectedSources={selectedSources}
        config={config}
        onToggle={toggleSource}
      />

      <RunPanel
        logs={runState.logs}
        progress={runState.progress}
        statusText={runState.statusText}
        isRunning={runState.isRunning}
        visible={runState.visible}
        onCancel={runState.cancel}
        onDismiss={runState.dismiss}
        showToast={showToast}
      />

      <AdminResultsPanel
        files={runState.files}
        visible={showResults}
        onClose={() => setShowResults(false)}
      />
    </div>
  );
}
