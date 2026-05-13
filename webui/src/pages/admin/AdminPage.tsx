import { useCallback, useEffect, useState } from 'react';
import type { AdminTab } from '../../lib/types';
import { useToast } from '../../hooks/useToast';
import { useConfig } from './hooks/useConfig';
import { useRunState } from './hooks/useRunState';
import { useHistory } from './hooks/useHistory';
import { Toast } from '../../components/Toast';
import { Header } from './components/Header';
import { DashboardView } from './components/dashboard/DashboardView';
import { ConfigView } from './components/config/ConfigView';
import { HistoryView } from './components/records/HistoryView';

export function AdminPage() {
  const { showToast } = useToast();
  const config = useConfig();
  const runState = useRunState();
  const history = useHistory();
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [tabKey, setTabKey] = useState(0);

  const handleTabChange = useCallback((tab: AdminTab) => {
    if (tab !== activeTab) {
      setActiveTab(tab);
      setTabKey((k) => k + 1);
    }
  }, [activeTab]);

  // Load config and history on mount
  useEffect(() => {
    config.reload();
    history.reload();
  }, []);

  // Refresh history after a successful run
  useEffect(() => {
    if (runState.visible && runState.files.length > 0 && !runState.isRunning) {
      history.reload();
    }
  }, [runState.isRunning, runState.files.length]);

  return (
    <>
      <Header activeTab={activeTab} onTabChange={handleTabChange} />

      <main
        key={tabKey}
        className="admin-tab-content mx-auto max-w-6xl px-4 py-8 md:px-8"
      >
        {activeTab === 'dashboard' && (
          <DashboardView
            config={config.config}
            runState={runState}
            showToast={showToast}
          />
        )}
        {activeTab === 'config' && (
          <ConfigView config={config} showToast={showToast} />
        )}
        {activeTab === 'history' && <HistoryView history={history} showToast={showToast} />}
      </main>

      <Toast />
    </>
  );
}
