/** 轻量 Markdown 渲染（大纲预览用）+ 目录提取 */

export type MdTocItem = {
  id: string;
  text: string;
  level: number;
};

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMd(raw: string) {
  let s = escapeHtml(raw);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  s = s.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  s = s.replace(/【([^】]+)】/g, '<strong>【$1】</strong>');
  return s;
}

/** 把常见中文网文大纲标题规范成 Markdown 标题，便于目录提取 */
export function normalizeOutlineMarkdown(raw: string): string {
  const text = String(raw || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  const hashCount = (text.match(/^#{1,3}\s+\S/gm) || []).length;
  // 已有足够 Markdown 标题时，仍清掉过长的伪标题行干扰
  if (hashCount >= 3) return text;

  const lines = text.split('\n');
  const out: string[] = [];

  for (const line of lines) {
    const t = line.trimEnd();
    const trimmed = t.trim();
    if (!trimmed) {
      out.push('');
      continue;
    }
    if (/^#{1,6}\s+/.test(trimmed)) {
      out.push(trimmed);
      continue;
    }
    // 一、标题 / 第一章
    if (
      (/^[一二三四五六七八九十百千]+[、.．]\s*\S/.test(trimmed) ||
        /^第[一二三四五六七八九十百千0-9]+[章节卷部篇幕]/.test(trimmed)) &&
      trimmed.length <= 40
    ) {
      out.push(`# ${trimmed}`);
      continue;
    }
    // 1) / 1. / 1、 仅短行当作小节标题
    if (/^[0-9]{1,2}[、.．）)]\s*\S/.test(trimmed) && trimmed.length <= 40) {
      out.push(`## ${trimmed}`);
      continue;
    }
    if (
      (/^（[一二三四五六七八九十]）/.test(trimmed) || /^\([0-9一二三四五六七八九十]+\)/.test(trimmed)) &&
      trimmed.length <= 40
    ) {
      out.push(`## ${trimmed}`);
      continue;
    }
    out.push(t);
  }

  return out.join('\n');
}

function isTableSepLine(line: string) {
  const t = line.trim();
  // |---|:---|---| 或 ---|---
  return /^\|?[\s:|-]+\|[\s:|-]+\|?$/.test(t) && /-/.test(t) && !/[^\s|:\-]/u.test(t);
}

function isTableRowLine(line: string) {
  const t = line.trim();
  if (!t.includes('|')) return false;
  if (isTableSepLine(t)) return true;
  // 至少两列
  const cells = splitTableRow(t);
  return cells.length >= 2;
}

function splitTableRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
}

function renderMdTable(rows: string[]): string {
  if (rows.length < 2) return '';
  const head = splitTableRow(rows[0]);
  let bodyStart = 1;
  if (isTableSepLine(rows[1])) bodyStart = 2;
  const body = rows.slice(bodyStart).filter((r) => !isTableSepLine(r));
  if (!head.length || !body.length) return '';

  const th = head.map((c) => `<th>${inlineMd(c)}</th>`).join('');
  const trs = body
    .map((row) => {
      const cells = splitTableRow(row);
      // 对齐列数
      while (cells.length < head.length) cells.push('');
      const tds = cells
        .slice(0, head.length)
        .map((c) => `<td>${inlineMd(c)}</td>`)
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');
  return `<div class="md-table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

/** 代码块内容若是 Markdown 表，则按表格渲染 */
function tryRenderFencedTable(code: string): string | null {
  const lines = code.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return null;
  if (!isTableRowLine(lines[0]) || !lines.some(isTableSepLine)) return null;
  if (!lines.every((l) => isTableRowLine(l) || isTableSepLine(l))) return null;
  const html = renderMdTable(lines);
  return html || null;
}

export function renderMarkdown(src: string): { html: string; toc: MdTocItem[] } {
  const text = normalizeOutlineMarkdown(src);
  if (!text.trim()) return { html: '', toc: [] };

  const lines = text.split('\n');
  const html: string[] = [];
  const toc: MdTocItem[] = [];
  let i = 0;
  let headingIdx = 0;
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      html.push('</ol>');
      inOl = false;
    }
  };

  const pushHeading = (level: number, rawText: string) => {
    closeLists();
    const plain = rawText.replace(/^#{1,6}\s+/, '').trim();
    const id = `md-h-${headingIdx++}`;
    toc.push({ id, text: plain, level: Math.min(3, Math.max(1, level)) });
    const tag = level <= 1 ? 'h2' : level === 2 ? 'h3' : 'h4';
    html.push(`<${tag} id="${id}">${inlineMd(plain)}</${tag}>`);
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();
    const trimmed = line.trim();
    i += 1;

    if (!trimmed) {
      closeLists();
      continue;
    }

    if (/^```/.test(trimmed)) {
      closeLists();
      const code: string[] = [];
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length && /^```/.test(lines[i].trim())) i += 1;
      const fenced = code.join('\n');
      const asTable = tryRenderFencedTable(fenced);
      if (asTable) html.push(asTable);
      else {
        html.push(`<pre><code>${escapeHtml(fenced)}</code></pre>`);
      }
      continue;
    }

    // GFM 表格：表头 + 分隔行 + 数据行
    if (
      isTableRowLine(trimmed) &&
      i < lines.length &&
      isTableSepLine(lines[i].trim())
    ) {
      closeLists();
      const tableLines = [trimmed, lines[i].trim()];
      i += 1;
      while (i < lines.length && isTableRowLine(lines[i].trim())) {
        tableLines.push(lines[i].trim());
        i += 1;
      }
      const tableHtml = renderMdTable(tableLines);
      if (tableHtml) html.push(tableHtml);
      else html.push(`<p>${inlineMd(trimmed)}</p>`);
      continue;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      closeLists();
      html.push('<hr />');
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      pushHeading(heading[1].length, trimmed);
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      closeLists();
      const quoteLines = [trimmed.replace(/^>\s?/, '')];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      html.push(`<blockquote><p>${inlineMd(quoteLines.join(' '))}</p></blockquote>`);
      continue;
    }

    if (/^[-*•]\s+\S/.test(trimmed)) {
      if (inOl) {
        html.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        html.push('<ul>');
        inUl = true;
      }
      html.push(`<li>${inlineMd(trimmed.replace(/^[-*•]\s+/, ''))}</li>`);
      continue;
    }

    if (/^\d+[.)、．]\s+\S/.test(trimmed) && trimmed.length > 72) {
      // 长编号行当正文，不当列表/标题
    } else if (/^\d+[.)]\s+\S/.test(trimmed)) {
      if (inUl) {
        html.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        html.push('<ol>');
        inOl = true;
      }
      html.push(`<li>${inlineMd(trimmed.replace(/^\d+[.)]\s+/, ''))}</li>`);
      continue;
    }

    closeLists();
    // 合并连续非空段落行
    const para = [trimmed];
    while (i < lines.length) {
      const n = lines[i].trim();
      if (!n) break;
      if (/^#{1,6}\s+/.test(n)) break;
      if (/^```/.test(n)) break;
      if (/^[-*•]\s+\S/.test(n)) break;
      if (/^\d+[.)]\s+\S/.test(n) && n.length <= 72) break;
      if (/^>\s?/.test(n)) break;
      if (/^---+$/.test(n)) break;
      if (isTableRowLine(n) && i + 1 < lines.length && isTableSepLine(lines[i + 1].trim())) break;
      para.push(n);
      i += 1;
    }
    html.push(`<p>${para.map((line) => inlineMd(line)).join('<br>')}</p>`);
  }

  closeLists();
  return { html: html.join('\n'), toc };
}

export function tocLabel(text: string, max = 22) {
  const cut = text.split(/[：:]/)[0]?.trim() || text;
  return cut.length > max ? `${cut.slice(0, max)}…` : cut;
}
