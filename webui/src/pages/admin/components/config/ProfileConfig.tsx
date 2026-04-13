import type { AdminConfig } from '../../../../lib/types';

interface ProfileConfigProps {
  config: AdminConfig;
  onChange: (patch: Partial<AdminConfig>) => void;
}

export function ProfileConfig({ config, onChange }: ProfileConfigProps) {
  return (
    <div className="glass-panel rounded-2xl border border-slate-200/80 p-6 shadow-soft">
      <h3 className="mb-4 text-lg font-semibold text-slate-800">研究者画像（可选）</h3>
      <textarea
        className="admin-input resize-none"
        rows={6}
        placeholder="用于生成研究想法的详细画像，包括你的研究背景、正在进行的项目、感兴趣的研究方向等..."
        value={config.researcher_profile}
        onChange={(e) => onChange({ researcher_profile: e.target.value })}
      />
    </div>
  );
}
