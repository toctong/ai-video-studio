/** Node Spec v2：角色/画幅/泳道标签（画布与资产轨共用） */

export type AssetRole = 'portrait' | 'sheet' | 'scene' | 'grid' | 'video' | 'other';

export const ASSET_ROLE_LABEL: Record<AssetRole, string> = {
  portrait: '定妆',
  sheet: '设定板',
  scene: '场景',
  grid: '分镜宫格',
  video: '成片',
  other: '其他',
};

export function inferAssetRole(a: {
  type?: string;
  name?: string;
  meta?: Record<string, unknown>;
}): AssetRole {
  const roleMeta = String(a.meta?.role || a.meta?.assetRole || '').toLowerCase();
  const blob = `${roleMeta} ${a.type || ''} ${a.name || ''}`.toLowerCase();
  if (/portrait|定妆|bust|半身/.test(blob)) return 'portrait';
  if (/sheet|设定板|三视|character_ref/.test(blob)) return 'sheet';
  if (/scene|场景/.test(blob)) return 'scene';
  if (/grid|宫格|storyboard|分镜|keyframe|关键帧/.test(blob)) return 'grid';
  if (/video|成片|mp4/.test(blob)) return 'video';
  return 'other';
}

export function inferNodeRoleChip(label: string, nodeType: string): string {
  const blob = `${label} ${nodeType}`.toLowerCase();
  if (/定妆|bust|portrait/.test(blob)) return '定妆';
  if (/设定板|sheet|三视/.test(blob)) return '设定板';
  if (/场景|scene\.ref|scene/.test(blob) && !/宫格/.test(blob)) return '场景';
  if (/宫格|grid|storyboard|分镜/.test(blob)) return '分镜';
  if (/成片|全能参考|ai\.video|video\.omni/.test(blob)) return '成片';
  if (/提示词|input\.text/.test(blob)) return '提示';
  if (/剧本|script/.test(blob)) return '剧本';
  return '';
}

/** 图片 / 视频新建时的默认宽高比（保持一致） */
export const DEFAULT_MEDIA_ASPECT = '16:9';

/** 媒体预览画幅：portrait | landscape | square */
export function inferFrameAspect(opts: {
  nodeType: string;
  aspect?: string;
  size?: string;
  label?: string;
  mediaW?: number;
  mediaH?: number;
}): 'portrait' | 'landscape' | 'square' {
  // 已有真实像素时优先按图判定（生成结果宽高比）
  const { mediaW: mw = 0, mediaH: mh = 0 } = opts;
  if (mw > 0 && mh > 0) {
    if (Math.abs(mw - mh) / Math.max(mw, mh) < 0.08) return 'square';
    return mh > mw * 1.05 ? 'portrait' : 'landscape';
  }

  const aspect = String(opts.aspect || '').trim();
  const am = aspect.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
  if (am) {
    const aw = Number(am[1]) || 0;
    const ah = Number(am[2]) || 0;
    if (aw > 0 && ah > 0) {
      if (Math.abs(aw - ah) / Math.max(aw, ah) < 0.08) return 'square';
      return ah > aw * 1.05 ? 'portrait' : 'landscape';
    }
  }

  const blob = `${opts.aspect || ''} ${opts.label || ''}`.toLowerCase();
  if (/9\s*[:/]\s*16|3\s*[:/]\s*4|2\s*[:/]\s*3|portrait|竖|定妆|bust/.test(blob)) return 'portrait';
  if (/1\s*[:/]\s*1|square|设定板|sheet|宫格|grid/.test(blob)) return 'square';
  if (/16\s*[:/]\s*9|4\s*[:/]\s*3|3\s*[:/]\s*2|21\s*[:/]\s*9|landscape|横/.test(blob)) {
    return 'landscape';
  }
  const size = String(opts.size || '').trim();
  const m = size.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (m) {
    const w = Number(m[1]) || 0;
    const h = Number(m[2]) || 0;
    if (w > 0 && h > 0) {
      if (Math.abs(w - h) / Math.max(w, h) < 0.08) return 'square';
      return h > w * 1.05 ? 'portrait' : 'landscape';
    }
  }
  // 默认与图片/视频一致：横版
  return 'landscape';
}
