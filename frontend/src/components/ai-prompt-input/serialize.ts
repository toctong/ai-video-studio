import type { JSONContent } from '@tiptap/core';

export type PromptGeneratePayload = {
  prompt: string;
  imageUrls: string[];
  videoUrls: string[];
};

export function cloneJson<T>(nodes: T): T {
  return JSON.parse(JSON.stringify(nodes)) as T;
}

function walkPlain(node: JSONContent): string {
  if (node.type === 'text') return String(node.text || '').replace(/\u200B/g, '');

  const children = (node.content || []).map(walkPlain).join('');

  switch (node.type) {
    case 'inputTag': {
      const filled = children.replace(/\uFEFF/g, '').trim();
      if (filled) return filled;
      return String(node.attrs?.label || '').replace(/^\[|\]$/g, '') || '';
    }
    case 'selectTag':
      return String(node.attrs?.value || '');
    case 'mentionTag': {
      const expand = String(node.attrs?.expandText || '').trim();
      if (expand) return expand;
      return String(node.attrs?.label || '').trim();
    }
    case 'paragraph':
      return children;
    case 'hardBreak':
      return '\n';
    case 'doc':
      return (node.content || []).map(walkPlain).join('\n');
    default:
      return children;
  }
}

/** 展示/回写用：文本 mention 展开正文，媒体 mention 保留标签文案 */
export function serializeToPlainText(doc: JSONContent | null | undefined): string {
  if (!doc) return '';
  return walkPlain(doc).replace(/\n+$/, '').trimEnd();
}

/**
 * 生成用：按 @ 出现顺序组装媒体 URL，并重编号为 @图1 / @视频1；
 * 文本 mention 展开为正文。
 */
export function serializeForGenerate(doc: JSONContent | null | undefined): PromptGeneratePayload {
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];

  const walk = (node: JSONContent): string => {
    if (node.type === 'text') return String(node.text || '').replace(/\u200B/g, '');
    const children = (node.content || []).map(walk).join('');
    switch (node.type) {
      case 'inputTag': {
        const filled = children.replace(/\uFEFF/g, '').trim();
        if (filled) return filled;
        return String(node.attrs?.label || '').replace(/^\[|\]$/g, '') || '';
      }
      case 'selectTag':
        return String(node.attrs?.value || '');
      case 'mentionTag': {
        const expand = String(node.attrs?.expandText || '').trim();
        if (expand) return expand;
        const url = String(node.attrs?.url || '').trim();
        const kind = String(node.attrs?.mediaKind || '').trim();
        if (url && kind === 'video') {
          if (!videoUrls.includes(url)) videoUrls.push(url);
          const idx = videoUrls.indexOf(url) + 1;
          return `@视频${idx}`;
        }
        if (url) {
          if (!imageUrls.includes(url)) imageUrls.push(url);
          const idx = imageUrls.indexOf(url) + 1;
          return `@图${idx}`;
        }
        return String(node.attrs?.label || '').trim();
      }
      case 'paragraph':
        return children;
      case 'hardBreak':
        return '\n';
      case 'doc':
        return (node.content || []).map(walk).join('\n');
      default:
        return children;
    }
  };

  return {
    prompt: walk(doc || { type: 'doc', content: [] })
      .replace(/\n+$/, '')
      .trimEnd(),
    imageUrls,
    videoUrls,
  };
}

export function plainTextToDoc(text: string): JSONContent {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  if (!lines.length || (lines.length === 1 && !lines[0])) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    };
  }
  return {
    type: 'doc',
    content: lines.map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : undefined,
    })),
  };
}

export function emptyDoc(): JSONContent {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

export function hasInlineTags(doc: JSONContent | null | undefined): boolean {
  if (!doc) return false;
  const walk = (node: JSONContent): boolean => {
    if (
      node.type === 'inputTag' ||
      node.type === 'selectTag' ||
      node.type === 'mentionTag'
    ) {
      return true;
    }
    return (node.content || []).some(walk);
  };
  return walk(doc);
}

export function isPromptDoc(value: unknown): value is JSONContent {
  return !!value && typeof value === 'object' && (value as JSONContent).type === 'doc';
}

export function parsePromptDoc(raw: string | null | undefined): JSONContent | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    const parsed = JSON.parse(s) as unknown;
    return isPromptDoc(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 将生成态文本里的 @图N / @视频N 还原为 mention 节点（无 rich doc 时的回退）。
 */
export function hydrateMentionsFromPrompt(
  text: string,
  opts?: { imageUrls?: string[]; videoUrls?: string[] },
): JSONContent {
  const imageUrls = opts?.imageUrls || [];
  const videoUrls = opts?.videoUrls || [];
  const tokenRe = /@(图|视频)(\d+)/g;

  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  if (!lines.length || (lines.length === 1 && !lines[0])) {
    return emptyDoc();
  }

  return {
    type: 'doc',
    content: lines.map((line) => {
      const content: JSONContent[] = [];
      let last = 0;
      tokenRe.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = tokenRe.exec(line))) {
        if (m.index > last) {
          content.push({ type: 'text', text: line.slice(last, m.index) });
        }
        const kind = m[1] === '视频' ? 'video' : 'image';
        const idx = Math.max(1, Number(m[2]) || 1) - 1;
        const url =
          kind === 'video'
            ? String(videoUrls[idx] || '').trim()
            : String(imageUrls[idx] || '').trim();
        const label = m[0];
        content.push({
          type: 'mentionTag',
          attrs: {
            label,
            mentionId: '',
            expandText: '',
            url,
            mediaKind: kind,
          },
        });
        last = m.index + m[0].length;
      }
      if (last < line.length) {
        content.push({ type: 'text', text: line.slice(last) });
      }
      return {
        type: 'paragraph',
        content: content.length ? content : undefined,
      };
    }),
  };
}

/** 优先 rich doc；否则尝试从 @图N + urls 还原；再退回纯文本 */
export function resolveEditorDoc(opts: {
  richDoc?: JSONContent | null;
  prompt?: string;
  imageUrls?: string[];
  videoUrls?: string[];
}): JSONContent {
  if (isPromptDoc(opts.richDoc)) return cloneJson(opts.richDoc);
  const prompt = String(opts.prompt || '');
  const images = opts.imageUrls || [];
  const videos = opts.videoUrls || [];
  if (prompt && (images.length || videos.length) && /@(图|视频)\d+/.test(prompt)) {
    return hydrateMentionsFromPrompt(prompt, { imageUrls: images, videoUrls: videos });
  }
  return plainTextToDoc(prompt);
}

/** 旧 Slate 风格模板节点 → TipTap doc */
export function legacyTemplateToDoc(nodes: any[]): JSONContent {
  const paragraphs = Array.isArray(nodes) ? nodes : [];
  return {
    type: 'doc',
    content: paragraphs.map((para) => {
      const children = Array.isArray(para?.children) ? para.children : [];
      const content: JSONContent[] = [];
      for (const child of children) {
        if (child == null) continue;
        if (typeof child.text === 'string' && !child.type) {
          if (child.text) content.push({ type: 'text', text: child.text });
          continue;
        }
        if (child.type === 'input-tag' || child.type === 'inputTag') {
          const t = (child.children || [])
            .map((c: any) => c?.text || '')
            .join('')
            .replace(/\uFEFF/g, '');
          content.push({
            type: 'inputTag',
            attrs: { label: String(child.label || '[填写]') },
            content: t ? [{ type: 'text', text: t }] : [],
          });
          continue;
        }
        if (child.type === 'select-tag' || child.type === 'selectTag') {
          content.push({
            type: 'selectTag',
            attrs: {
              value: String(child.value || child.options?.[0]?.value || ''),
              options: Array.isArray(child.options) ? child.options : [],
            },
          });
          continue;
        }
        if (child.type === 'mention-tag' || child.type === 'mentionTag') {
          content.push({
            type: 'mentionTag',
            attrs: {
              label: String(child.label || '@参考'),
              mentionId: String(child.mentionId || ''),
              expandText: String(child.expandText || ''),
              url: String(child.url || ''),
              mediaKind: String(child.mediaKind || ''),
            },
          });
        }
      }
      return {
        type: 'paragraph',
        content: content.length ? content : undefined,
      };
    }),
  };
}
