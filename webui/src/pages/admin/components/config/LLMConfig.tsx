import type { AdminConfig } from '../../../../lib/types';

interface LLMConfigProps {
  config: AdminConfig;
  onChange: (patch: Partial<AdminConfig>) => void;
}

export function LLMConfig({ config, onChange }: LLMConfigProps) {
  return (
    <div className="glass-panel rounded-2xl border border-slate-200/80 p-6 shadow-soft">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-800">
        <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        LLM 配置
      </h3>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Provider</label>
          <select
            className="admin-input"
            value={config.provider}
            onChange={(e) => onChange({ provider: e.target.value })}
          >
            <option value="openai">OpenAI</option>
            <option value="siliconflow">SiliconFlow</option>
            <option value="ollama">Ollama</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Model</label>
          <input
            type="text"
            className="admin-input"
            placeholder="gpt-4o-mini"
            value={config.model}
            onChange={(e) => onChange({ model: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Base URL</label>
          <input
            type="text"
            className="admin-input"
            placeholder="https://api.openai.com/v1"
            value={config.base_url}
            onChange={(e) => onChange({ base_url: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">API Key</label>
          <input
            type="password"
            className="admin-input"
            placeholder="sk-..."
            value={config.api_key}
            onChange={(e) => onChange({ api_key: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Temperature</label>
          <input
            type="number"
            className="admin-input"
            min={0}
            max={2}
            step={0.1}
            value={config.temperature}
            onChange={(e) => onChange({ temperature: parseFloat(e.target.value) || 0 })}
          />
        </div>
      </div>
    </div>
  );
}
