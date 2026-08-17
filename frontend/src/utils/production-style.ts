import type { ProductionRow, ProductionStyle } from '@/api/productions';
import { buildStyleHead } from '@/utils/script-gen-layout';

export { prependStyleLock } from '@/utils/style-lock';

export type ResolvedProductionStyle = {
  family: string;
  sub: string;
  brief: string;
  lock: string;
  styleTag: string;
  /** omni 默认；templateId=keyframe 时为关键帧高级模板 */
  videoRefMode: 'omni' | 'keyframe';
};

const FAMILY_ALIASES: Record<string, string> = {
  国漫: '二次元动漫',
  动漫: '二次元动漫',
  动漫风: '二次元动漫',
  国风: '国风东方',
  水墨风: '国风东方',
};

/** 编译期唯一画风出口：Production.style → FAMILY/SUB/硬锁句 */
export function resolveProductionStyle(
  p: Pick<ProductionRow, 'style' | 'tags' | 'meta' | 'templateId'>,
): ResolvedProductionStyle {
  const style: ProductionStyle = p.style && typeof p.style === 'object' ? p.style : {};
  const metaCat = String(p.meta?.category || '').trim();
  let family = String(style.family || metaCat || '').trim();
  if (FAMILY_ALIASES[family]) family = FAMILY_ALIASES[family];

  const tagSub =
    (p.tags || []).find((t) => t && !/^project:|^production:|制作单|项目|镜头库|全能参考|关键帧|对话|书库/.test(t)) ||
    '';
  const sub = String(style.sub || tagSub || '').trim();
  const brief = String(style.brief || '').trim();
  const lockFromStyle = String(style.lock || '').trim();
  const lock =
    lockFromStyle ||
    buildStyleHead({
      category: family,
      subStyle: sub,
      styleBrief: brief,
    });
  const styleTag = [family, sub].filter(Boolean).join('·');
  const tpl = String(p.templateId || p.meta?.templateId || '').toLowerCase();
  const videoRefMode: 'omni' | 'keyframe' =
    tpl === 'keyframe' || tpl === 'triple-keyframe' ? 'keyframe' : 'omni';

  return { family, sub, brief, lock, styleTag, videoRefMode };
}

/** 把解析结果写回 Production.style（保证 lock 字段有值，供导出/复制） */
export function stylePatchFromResolved(r: ResolvedProductionStyle): ProductionStyle {
  return {
    family: r.family || undefined,
    sub: r.sub || undefined,
    brief: r.brief || undefined,
    lock: r.lock || undefined,
  };
}
