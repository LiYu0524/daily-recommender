import type { AdminConfig } from '../../../../lib/types';

interface EmailConfigProps {
  config: AdminConfig;
  onChange: (patch: Partial<AdminConfig>) => void;
}

export function EmailConfig({ config, onChange }: EmailConfigProps) {
  return (
    <div className="glass-panel rounded-2xl border border-slate-200/80 p-6 shadow-soft">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-800">
        <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        邮件配置
      </h3>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">SMTP Server</label>
          <input
            type="text"
            className="admin-input"
            placeholder="smtp.gmail.com"
            value={config.smtp_server}
            onChange={(e) => onChange({ smtp_server: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">SMTP Port</label>
          <input
            type="number"
            className="admin-input"
            value={config.smtp_port}
            onChange={(e) => onChange({ smtp_port: parseInt(e.target.value) || 465 })}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Sender Email</label>
          <input
            type="email"
            className="admin-input"
            placeholder="you@example.com"
            value={config.sender}
            onChange={(e) => onChange({ sender: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Receiver Email</label>
          <input
            type="email"
            className="admin-input"
            placeholder="you@example.com"
            value={config.receiver}
            onChange={(e) => onChange({ receiver: e.target.value })}
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
          <input
            type="password"
            className="admin-input"
            placeholder="应用专用密码"
            value={config.smtp_password}
            onChange={(e) => onChange({ smtp_password: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
