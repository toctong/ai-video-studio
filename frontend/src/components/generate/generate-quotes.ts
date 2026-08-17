export type GenerateQuoteKind = 'image' | 'video';

export type GenerateQuote = {
  id: string;
  kind: GenerateQuoteKind;
  /** 图片/视频 URL */
  url?: string;
  sourceMessageId?: string;
  label?: string;
};

export const GENERATE_QUOTE_MAX = 8;

export function createQuoteId() {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function quoteLabel(q: GenerateQuote, index = 0) {
  if (q.label) return q.label;
  return q.kind === 'video' ? `视频 ${index + 1}` : `图片 ${index + 1}`;
}

export function quotesFromPrefs(prefs?: Record<string, unknown> | null): GenerateQuote[] {
  const raw = prefs?.quotes;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, i) => {
      if (!item || typeof item !== 'object') return null;
      const o = item as Record<string, unknown>;
      const kind = String(o.kind || '') as GenerateQuoteKind;
      if (kind !== 'image' && kind !== 'video') return null;
      const url = o.url != null ? String(o.url).trim() : '';
      if (!url) return null;
      return {
        id: String(o.id || `pref_${i}`),
        kind,
        url,
        sourceMessageId: o.sourceMessageId != null ? String(o.sourceMessageId) : undefined,
        label: o.label != null ? String(o.label) : undefined,
      } satisfies GenerateQuote;
    })
    .filter(Boolean) as GenerateQuote[];
}

/** 发给后端的精简结构 */
export function serializeQuotes(quotes: GenerateQuote[]) {
  return quotes
    .filter((q) => q.kind === 'image' || q.kind === 'video')
    .map((q) => ({
      id: q.id,
      kind: q.kind,
      url: String(q.url || '').trim(),
      label: q.label || undefined,
      sourceMessageId: q.sourceMessageId || undefined,
    }));
}

export function mediaUrlsFromQuotes(quotes: GenerateQuote[]) {
  const images = quotes
    .filter((q) => q.kind === 'image')
    .map((q) => String(q.url || '').trim())
    .filter(Boolean);
  const videos = quotes
    .filter((q) => q.kind === 'video')
    .map((q) => String(q.url || '').trim())
    .filter(Boolean);
  return { images, videos };
}
