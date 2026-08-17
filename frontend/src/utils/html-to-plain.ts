/** 富文本 / HTML 转纯文本，保留段落换行（供 AI 提示词与导出） */
export function htmlToPlainText(raw: string): string {
  const s = String(raw || '');
  if (!s.trim()) return '';
  if (!/<\/?[a-z][\s\S]*>/i.test(s)) return s;

  const normalized = s
    .replace(/\r\n/g, '\n')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|h[1-6]|li|tr|blockquote)\s*>/gi, '\n')
    .replace(/<\s*(p|div|h[1-6]|li|tr|blockquote)[^>]*>/gi, '')
    .replace(/<\/?\s*(ul|ol|table|thead|tbody|tfoot|tr|td|th)[^>]*>/gi, '');

  if (typeof document !== 'undefined') {
    const box = document.createElement('div');
    box.innerHTML = normalized;
    return tidyPlain((box.textContent || box.innerText || '').replace(/\u00a0/g, ' '));
  }

  return tidyPlain(
    normalized
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'"),
  );
}

function tidyPlain(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
