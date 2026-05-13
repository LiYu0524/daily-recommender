import { useRef } from 'react';

interface CustomPaneProps {
  onSend: (data: {
    email: string;
    description: string;
    scholarUrls: string;
    xAccountsInput: string;
  }) => void;
  disabled: boolean;
  showTwitter: boolean;
}

export function CustomPane({ onSend, disabled, showTwitter }: CustomPaneProps) {
  const emailRef = useRef<HTMLInputElement>(null);
  const interestRef = useRef<HTMLTextAreaElement>(null);
  const scholarRef = useRef<HTMLTextAreaElement>(null);
  const xInputRef = useRef<HTMLTextAreaElement>(null);

  const handleClick = () => {
    onSend({
      email: emailRef.current?.value.trim() || '',
      description: interestRef.current?.value.trim() || '',
      scholarUrls: scholarRef.current?.value.trim() || '',
      xAccountsInput: showTwitter ? xInputRef.current?.value.trim() || '' : '',
    });
  };

  return (
    <div className="rounded-[1.7rem] border border-white/80 bg-white/90 p-4 shadow-soft">
      <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
            Custom Mode
          </p>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            补充兴趣和 Scholar 链接，生成一次性的专属推荐。
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="md:col-span-2">
            <label
              htmlFor="custom-email"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              邮箱
            </label>
            <input
              id="custom-email"
              ref={emailRef}
              type="email"
              placeholder="you@example.com"
              className="h-14 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base outline-none transition focus:border-sea focus:ring-4 focus:ring-emerald-100"
            />
          </div>

          <div>
            <label
              htmlFor="custom-interest"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              研究兴趣 / 兴趣点
            </label>
            <textarea
              id="custom-interest"
              ref={interestRef}
              rows={6}
              placeholder="例如：Agent evaluation, long-context systems, coding agents, scientific discovery..."
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 outline-none transition focus:border-sea focus:ring-4 focus:ring-emerald-100"
            />
          </div>

          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  htmlFor="custom-scholar"
                  className="block text-sm font-semibold text-slate-700"
                >
                  Google Scholar 链接
                </label>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">
                  可选 · 支持多个
                </span>
              </div>
              <textarea
                id="custom-scholar"
                ref={scholarRef}
                rows={3}
                placeholder={'https://scholar.google.com/citations?user=AAA\nhttps://scholar.google.com/citations?user=BBB'}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 outline-none transition focus:border-sea focus:ring-4 focus:ring-emerald-100"
              />
              <p className="mt-2 text-xs leading-6 text-slate-600">
                一行一个链接，仅本次生效。若同时勾选 X /
                Twitter，会辅助一次性账号 discovery。
              </p>
            </div>

            {showTwitter && (
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label
                    htmlFor="custom-x-input"
                    className="block text-sm font-semibold text-slate-700"
                  >
                    X 信息源
                  </label>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">
                    仅本次生效
                  </span>
                </div>
                <textarea
                  id="custom-x-input"
                  ref={xInputRef}
                  rows={5}
                  placeholder={'@openai\nhttps://x.com/karpathy\nhuggingface'}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 outline-none transition focus:border-sea focus:ring-4 focus:ring-emerald-100"
                />
                <p className="mt-2 text-xs leading-6 text-slate-600">
                  只有勾选 X / Twitter
                  时才会生效。一行一个，支持 用户名、@用户名 或 x.com
                  链接；留空则继续使用后台默认账号池。
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-7 text-emerald-800">
              本次输入不会写入服务器全局配置，也不会覆盖后台里的默认兴趣描述。
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-ink px-6 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-55"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10l9-7 9 7-9 7-9-7z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 21l3-2 3 2" />
          </svg>
          <span>发送定制版 Daily Trend</span>
        </button>
      </div>
    </div>
  );
}
