import type { DeliveryMode, PublicMeta } from '../../../lib/types';
import { DeliveryToggle } from './DeliveryToggle';
import { QuickPane } from './QuickPane';
import { CustomPane } from './CustomPane';

interface SendFormProps {
  mode: 'quick' | 'custom';
  deliveryMode: DeliveryMode;
  selectedSources: Set<string>;
  meta: PublicMeta;
  isRunning: boolean;
  onDeliveryModeChange: (mode: DeliveryMode) => void;
  onQuickSend: (email: string) => void;
  onCustomSend: (data: {
    email: string;
    description: string;
    scholarUrls: string;
    xAccountsInput: string;
  }) => void;
}

export function SendForm({
  mode,
  deliveryMode,
  selectedSources,
  meta,
  isRunning,
  onDeliveryModeChange,
  onQuickSend,
  onCustomSend,
}: SendFormProps) {
  const showTwitter =
    mode === 'custom' &&
    selectedSources.has('twitter') &&
    meta.twitter_enabled;

  return (
    <section className="glass-panel rounded-[2rem] border border-white/70 p-6 shadow-panel md:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-slate-400">
            发送
          </p>
          <h3 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-ink">
            {mode === 'quick'
              ? '快速发送今天的汇总'
              : '生成你的定制 Daily Trend'}
          </h3>
        </div>
        <div className="animate-drift inline-flex items-center rounded-3xl bg-gradient-to-br from-emerald-100 to-cyan-50 px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] text-sea">
          一封邮件送达
        </div>
      </div>

      <DeliveryToggle mode={deliveryMode} onChange={onDeliveryModeChange} />

      {mode === 'quick' ? (
        <div className="mt-6">
          <QuickPane onSend={onQuickSend} disabled={isRunning} />
        </div>
      ) : (
        <div className="mt-6">
          <CustomPane
            onSend={onCustomSend}
            disabled={isRunning}
            showTwitter={showTwitter}
          />
        </div>
      )}
    </section>
  );
}
