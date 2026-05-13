export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  let html = '';
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (inList && !trimmed.startsWith('- ') && !trimmed.startsWith('* ')) {
      html += '</ul>';
      inList = false;
    }

    if (trimmed.startsWith('### ')) {
      html += `<h3 style="font-size:1.1rem;font-weight:600;margin:1rem 0 0.5rem">${mdInline(trimmed.slice(4))}</h3>`;
    } else if (trimmed.startsWith('## ')) {
      html += `<h2 style="font-size:1.25rem;font-weight:600;margin:1.25rem 0 0.6rem">${mdInline(trimmed.slice(3))}</h2>`;
    } else if (trimmed.startsWith('# ')) {
      html += `<h1 style="font-size:1.5rem;font-weight:700;margin:1.5rem 0 0.75rem">${mdInline(trimmed.slice(2))}</h1>`;
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        html += '<ul style="list-style:disc;padding-left:1.5rem;margin:0.5rem 0">';
        inList = true;
      }
      html += `<li style="margin-bottom:0.25rem">${mdInline(trimmed.slice(2))}</li>`;
    } else if (trimmed === '') {
      html += '<div style="height:0.4rem"></div>';
    } else {
      html += `<p style="margin-bottom:0.5rem">${mdInline(trimmed)}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html;
}

function mdInline(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(
      /`([^`]+)`/g,
      '<code style="background:#f1f5f9;padding:0.1rem 0.35rem;border-radius:0.25rem;font-size:0.85em">$1</code>',
    )
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer" style="color:#0f766e;text-decoration:none">$1</a>',
    );
}

export function updateProgress(message: string): number {
  const lower = message.toLowerCase();
  if (lower.includes('scholar') || lower.includes('profile') || lower.includes('画像')) return 16;
  if (lower.includes('running source') || lower.includes('github')) return 30;
  if (lower.includes('huggingface')) return 45;
  if (lower.includes('twitter')) return 58;
  if (lower.includes('processing') || lower.includes('评估')) return 72;
  if (lower.includes('report')) return 84;
  if (lower.includes('email')) return 94;
  return 10;
}
