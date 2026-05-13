import type { AdminConfig } from '../../../../lib/types';

interface SourceConfigProps {
  config: AdminConfig;
  onChange: (patch: Partial<AdminConfig>) => void;
}

export function SourceConfig({ config, onChange }: SourceConfigProps) {
  return (
    <div className="glass-panel rounded-2xl border border-slate-200/80 p-6 shadow-soft">
      <h3 className="mb-4 text-lg font-semibold text-slate-800">信息源配置</h3>

      {/* GitHub */}
      <div className="mb-6 border-b border-slate-100 pb-6">
        <h4 className="mb-3 font-medium text-slate-700">GitHub</h4>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">语言</label>
            <select
              className="admin-input"
              value={config.gh_languages}
              onChange={(e) => onChange({ gh_languages: e.target.value })}
            >
              <option value="all">All</option>
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="go">Go</option>
              <option value="rust">Rust</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">时间范围</label>
            <select
              className="admin-input"
              value={config.gh_since}
              onChange={(e) => onChange({ gh_since: e.target.value })}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">最大仓库数</label>
            <input
              type="number"
              className="admin-input"
              min={5}
              max={100}
              value={config.gh_max_repos}
              onChange={(e) => onChange({ gh_max_repos: parseInt(e.target.value) || 30 })}
            />
          </div>
        </div>
      </div>

      {/* HuggingFace */}
      <div className="mb-6 border-b border-slate-100 pb-6">
        <h4 className="mb-3 font-medium text-slate-700">HuggingFace</h4>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">内容类型</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.hf_content_types.includes('papers')}
                  onChange={(e) => {
                    const types = e.target.checked
                      ? [...config.hf_content_types, 'papers']
                      : config.hf_content_types.filter((t) => t !== 'papers');
                    onChange({ hf_content_types: types });
                  }}
                />
                <span className="text-sm">Papers</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={config.hf_content_types.includes('models')}
                  onChange={(e) => {
                    const types = e.target.checked
                      ? [...config.hf_content_types, 'models']
                      : config.hf_content_types.filter((t) => t !== 'models');
                    onChange({ hf_content_types: types });
                  }}
                />
                <span className="text-sm">Models</span>
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">最大论文数</label>
              <input
                type="number"
                className="admin-input"
                value={config.hf_max_papers}
                onChange={(e) => onChange({ hf_max_papers: parseInt(e.target.value) || 30 })}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">最大模型数</label>
              <input
                type="number"
                className="admin-input"
                value={config.hf_max_models}
                onChange={(e) => onChange({ hf_max_models: parseInt(e.target.value) || 15 })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Twitter */}
      <div className="mb-6 border-b border-slate-100 pb-6">
        <h4 className="mb-3 font-medium text-slate-700">X / Twitter</h4>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">RapidAPI Key</label>
            <input
              type="password"
              className="admin-input"
              value={config.x_rapidapi_key}
              onChange={(e) => onChange({ x_rapidapi_key: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">监控账号（每行一个）</label>
            <textarea
              className="admin-input resize-none font-mono"
              rows={4}
              placeholder={'elonmusk\nsama\n...'}
              value={config.x_accounts}
              onChange={(e) => onChange({ x_accounts: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* arXiv */}
      <div className="mb-6 border-b border-slate-100 pb-6">
        <h4 className="mb-3 font-medium text-slate-700">arXiv</h4>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">分类（空格分隔）</label>
            <input
              type="text"
              className="admin-input font-mono"
              placeholder="cs.AI cs.CL cs.CV"
              value={config.arxiv_categories}
              onChange={(e) => onChange({ arxiv_categories: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">每分类最大抓取</label>
            <input
              type="number"
              className="admin-input"
              min={10}
              max={500}
              value={config.arxiv_max_entries}
              onChange={(e) => onChange({ arxiv_max_entries: parseInt(e.target.value) || 100 })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">推荐论文数</label>
            <input
              type="number"
              className="admin-input"
              min={5}
              max={200}
              value={config.arxiv_max_papers}
              onChange={(e) => onChange({ arxiv_max_papers: parseInt(e.target.value) || 60 })}
            />
          </div>
        </div>
      </div>

      {/* Semantic Scholar */}
      <div>
        <h4 className="mb-3 font-medium text-slate-700">
          Semantic Scholar{' '}
          <span className="text-xs font-normal text-slate-400">（WoS 替代，跨期刊论文）</span>
        </h4>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">每查询最大抓取</label>
            <input
              type="number"
              className="admin-input"
              min={10}
              max={200}
              value={config.ss_max_results}
              onChange={(e) => onChange({ ss_max_results: parseInt(e.target.value) || 60 })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">推荐论文数</label>
            <input
              type="number"
              className="admin-input"
              min={5}
              max={100}
              value={config.ss_max_papers}
              onChange={(e) => onChange({ ss_max_papers: parseInt(e.target.value) || 30 })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">年份过滤</label>
            <input
              type="text"
              className="admin-input font-mono"
              placeholder="2024- 或留空"
              value={config.ss_year}
              onChange={(e) => onChange({ ss_year: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="mb-1.5 block text-xs font-medium text-slate-500">API Key（可选，用于提高速率限制）</label>
          <input
            type="password"
            className="admin-input"
            value={config.ss_api_key}
            onChange={(e) => onChange({ ss_api_key: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
