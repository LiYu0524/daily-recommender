import type { AdminConfig } from '../../../../lib/types';

interface InterestConfigProps {
  config: AdminConfig;
  onChange: (patch: Partial<AdminConfig>) => void;
}

export function InterestConfig({ config, onChange }: InterestConfigProps) {
  return (
    <div className="glass-panel rounded-2xl border border-slate-200/80 p-6 shadow-soft">
      <h3 className="mb-4 text-lg font-semibold text-slate-800">兴趣描述</h3>
      <textarea
        className="admin-input resize-none"
        rows={6}
        placeholder={`描述你感兴趣的领域，例如：\n1. Agent Safety - 关注 AI Agent 的安全对齐\n2. Multi-modal - 多模态学习进展\n\nI'm not interested in:\n1. Crypto/Web3\n...`}
        value={config.description}
        onChange={(e) => onChange({ description: e.target.value })}
      />
      <p className="mt-2 text-xs text-slate-500">LLM 将根据此描述评估内容相关性</p>
    </div>
  );
}
