import type { AdminConfig } from '../../../../lib/types';
import { ADMIN_SOURCES } from '../../../../lib/constants';

interface ScheduleConfigProps {
  config: AdminConfig;
  onChange: (patch: Partial<AdminConfig>) => void;
}

export function ScheduleConfig({ config, onChange }: ScheduleConfigProps) {
  const toggleScheduleSource = (source: string) => {
    const sources = config.schedule_sources.includes(source)
      ? config.schedule_sources.filter((s) => s !== source)
      : [...config.schedule_sources, source];
    onChange({ schedule_sources: sources });
  };

  return (
    <div className="glass-panel rounded-2xl border border-slate-200/80 p-6 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">定时推送</h3>
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={config.schedule_enabled}
            onChange={(e) => onChange({ schedule_enabled: e.target.checked })}
          />
          <div className="h-6 w-11 rounded-full bg-slate-200 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white" />
          <span className="ml-2 text-sm text-slate-600">启用</span>
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-500">推送频率</label>
          <select
            className="admin-input"
            value={config.schedule_frequency}
            onChange={(e) => onChange({ schedule_frequency: e.target.value })}
          >
            <option value="daily">每日</option>
            <option value="weekdays">仅工作日（周一至周五）</option>
            <option value="weekly">每周（周一）</option>
            <option value="monthly">每月（1号）</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-500">推送时间</label>
          <input
            type="time"
            className="admin-input"
            value={config.schedule_time}
            onChange={(e) => onChange({ schedule_time: e.target.value })}
          />
        </div>
      </div>
      <div className="mt-4">
        <label className="mb-2 block text-xs font-medium text-slate-500">推送信息源</label>
        <div className="flex flex-wrap gap-3">
          {ADMIN_SOURCES.map((source) => (
            <label key={source} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.schedule_sources.includes(source)}
                onChange={() => toggleScheduleSource(source)}
              />
              <span className="text-sm">{source}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.schedule_generate_report}
            onChange={(e) => onChange({ schedule_generate_report: e.target.checked })}
          />
          <span className="text-sm">生成跨源报告</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.schedule_generate_ideas}
            onChange={(e) => onChange({ schedule_generate_ideas: e.target.checked })}
          />
          <span className="text-sm">生成研究想法</span>
        </label>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        定时任务在 Web Server 运行期间生效。推送将使用已保存的全局配置。
      </p>
    </div>
  );
}
