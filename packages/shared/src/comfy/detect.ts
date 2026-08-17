import type { ComfyApiPrompt, ComfyUiWorkflow } from './types';

/** 是否像 ComfyUI 保存的 Workflow JSON（nodes 数组 + type/class） */
export function isComfyUiWorkflow(raw: unknown): raw is ComfyUiWorkflow {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.nodes) || !o.nodes.length) return false;
  const sample = o.nodes.slice(0, 8);
  const looksComfy = sample.every((n) => {
    if (!n || typeof n !== 'object') return false;
    const node = n as Record<string, unknown>;
    return (
      (typeof node.type === 'string' || typeof node.class_type === 'string') &&
      (node.id != null || node.order != null)
    );
  });
  if (!looksComfy) return false;
  // 排除 AIGC 视频工厂 Document（schemaVersion + dotted types 为主）
  if (o.schemaVersion === 2 && Array.isArray(o.edges)) return false;
  if (o.format === 'lumina-workflow-v1' || o.format === 'lumina-nodepack-v1') return false;
  // Comfy 节点 type 通常是 PascalCase / 自定义名，而非 a.b
  const dotted = sample.filter((n) => {
    const t = String((n as any)?.type || '');
    return t.includes('.') && /^[a-z]/.test(t);
  }).length;
  if (dotted >= Math.ceil(sample.length * 0.6)) return false;
  return true;
}

/** 是否像 Comfy API Prompt */
export function isComfyApiPrompt(raw: unknown): raw is ComfyApiPrompt {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion != null || o.nodes != null || o.format != null) return false;
  const keys = Object.keys(o);
  if (!keys.length || keys.length > 500) return false;
  let hits = 0;
  for (const k of keys.slice(0, 12)) {
    const n = o[k];
    if (n && typeof n === 'object' && typeof (n as any).class_type === 'string') hits += 1;
  }
  return hits >= Math.min(2, keys.length) && hits >= Math.ceil(Math.min(keys.length, 12) * 0.5);
}

export function isComfyJson(raw: unknown): boolean {
  return isComfyUiWorkflow(raw) || isComfyApiPrompt(raw);
}
