import type { RunFile } from '../../../lib/types';
import { escapeHtml } from '../../../lib/utils';
import { MarkdownRender } from '../../../components/MarkdownRender';

interface FileCardProps {
  file: RunFile;
}

export function FileCard({ file }: FileCardProps) {
  if (file.type === 'html') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-ink">{escapeHtml(file.name)}</p>
            <p className="mt-1 text-xs text-slate-500">HTML 预览</p>
          </div>
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-sea shadow-soft"
          >
            打开
          </a>
        </div>
      </div>
    );
  }

  if (file.type === 'json_list' && file.items) {
    return (
      <details className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">
          {escapeHtml(file.name)}{' '}
          <span className="ml-1 text-xs font-normal text-slate-400">
            ({file.items.length})
          </span>
        </summary>
        <div className="divide-y divide-slate-200 bg-white">
          {file.items.map((item, index) => (
            <div
              key={index}
              className="px-4 py-3 transition hover:bg-slate-50"
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-400">
                  {index + 1}
                </span>
                <span className="font-semibold text-ink">
                  {escapeHtml(item.title || 'Untitled')}
                </span>
                {item.score != null && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${Number(item.score) >= 7 ? 'bg-emerald-50 text-emerald-700' : Number(item.score) >= 4 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {escapeHtml(String(item.score))} 分
                  </span>
                )}
              </div>
              {(item.summary || item.description) && (
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  {escapeHtml(item.summary || item.description || '')}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex text-xs font-semibold text-sea hover:underline"
                  >
                    查看原始链接
                  </a>
                )}
                {item.language && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                    {escapeHtml(item.language)}
                  </span>
                )}
                {item.stars && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                    &#9734; {escapeHtml(String(item.stars))}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </details>
    );
  }

  const isMarkdown =
    file.name && (file.name.endsWith('.md') || file.type === 'markdown');

  return (
    <details
      className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
      open={file.source === 'reports'}
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">
        {escapeHtml(file.name)}
      </summary>
      {isMarkdown ? (
        <div className="max-h-[32rem] overflow-auto border-t border-slate-200 bg-white px-5 py-4 text-sm leading-7 text-slate-700 prose-render">
          <MarkdownRender content={file.content || ''} />
        </div>
      ) : (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap border-t border-slate-200 bg-white px-4 py-4 text-xs leading-6 text-slate-700">
          {escapeHtml(file.content || '')}
        </pre>
      )}
    </details>
  );
}
