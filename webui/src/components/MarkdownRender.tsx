import { renderMarkdown } from '../lib/utils';

export function MarkdownRender({ content }: { content: string }) {
  return (
    <div
      className="prose-render"
      dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
    />
  );
}
