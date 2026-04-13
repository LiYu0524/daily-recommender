import { useCallback } from 'react';
import type { AdminConfig } from '../../../../lib/types';
import { LLMConfig } from './LLMConfig';
import { EmailConfig } from './EmailConfig';
import { SourceConfig } from './SourceConfig';
import { InterestConfig } from './InterestConfig';
import { ProfileConfig } from './ProfileConfig';
import { ScheduleConfig } from './ScheduleConfig';

interface ConfigViewProps {
  config: {
    config: AdminConfig;
    loading: boolean;
    saving: boolean;
    update: (patch: Partial<AdminConfig>) => void;
    save: () => Promise<boolean>;
  };
  showToast: (message: string, type?: 'success' | 'warning' | 'error') => void;
}

export function ConfigView({ config, showToast }: ConfigViewProps) {
  const handleSave = useCallback(async () => {
    const ok = await config.save();
    showToast(ok ? '配置已保存' : '保存失败', ok ? 'success' : 'error');
  }, [config, showToast]);

  if (config.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-400">加载配置中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl text-slate-800">配置设置</h2>
        <button
          type="button"
          onClick={handleSave}
          disabled={config.saving}
          className="rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-500 px-6 py-2.5 text-sm font-medium text-white transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {config.saving ? '保存中...' : '保存配置'}
        </button>
      </div>

      <LLMConfig config={config.config} onChange={config.update} />
      <EmailConfig config={config.config} onChange={config.update} />
      <SourceConfig config={config.config} onChange={config.update} />
      <InterestConfig config={config.config} onChange={config.update} />
      <ProfileConfig config={config.config} onChange={config.update} />
      <ScheduleConfig config={config.config} onChange={config.update} />
    </div>
  );
}
