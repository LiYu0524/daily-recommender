import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ResultData } from '../../../../lib/types';
import { getResult } from '../../../../lib/api';
import { escapeHtml } from '../../../../lib/utils';
import { MarkdownRender } from '../../../../components/MarkdownRender';

interface ResultModalProps {
  source: string;
  date: string;
  onClose: () => void;
  showToast: (message: string, type?: 'success' | 'warning' | 'error') => void;
}

export function ResultModal({ source, date, onClose, showToast }: ResultModalProps) {
  const [data, setData] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getResult(source, date)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (!cancelled) showToast('加载结果失败: ' + e.message, 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source, date, showToast]);

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-4 flex min-h-0 flex-col rounded-2xl bg-white shadow-2xl md:inset-10">
        <div className="shrink-0 flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h3 className="font-semibold text-slate-800">{source} - {date}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 transition hover:bg-slate-100"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-6">
          {loading && <p className="text-slate-400">加载中...</p>}
          {!loading && data && (
            <>
              {data.markdown_files?.map((file, i) => (
                <div key={i} className="mb-6">
                  <h4 className="mb-2 font-medium text-slate-700">{escapeHtml(file.name)}</h4>
                  <div className="prose-render max-h-96 overflow-auto rounded-lg bg-slate-50 p-4 text-sm">
                    <MarkdownRender content={file.content || ''} />
                  </div>
                </div>
              ))}
              {data.html_files?.map((file, i) => (
                <div key={i} className="mb-6">
                  <h4 className="mb-2 font-medium text-slate-700">{escapeHtml(file.name)}</h4>
                  {file.url && (
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-600 hover:underline"
                    >
                      查看邮件 HTML
                    </a>
                  )}
                </div>
              ))}
              {data.json_files && data.json_files.length > 0 && (
                <div className="mb-6">
                  <h4 className="mb-2 font-medium text-slate-700">
                    数据文件 ({data.json_files.length})
                  </h4>
                  <div className="space-y-2">
                    {data.json_files.map((file, i) => (
                      <details key={i} className="overflow-hidden rounded-lg bg-slate-50">
                        <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
                          {escapeHtml(file.name)}
                        </summary>
                        <pre className="max-h-64 overflow-auto px-4 pb-4 text-xs">
                          {JSON.stringify(file.data, null, 2)}
                        </pre>
                      </details>
                    ))}
                  </div>
                </div>
              )}
              {!data.markdown_files?.length && !data.html_files?.length && !data.json_files?.length && (
                <p className="text-slate-500">无详细数据</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
