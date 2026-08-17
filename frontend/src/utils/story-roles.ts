/** 剧中身份站位 + 正邪阵营（角色页分组与标注） */

export const STORY_ROLES = [
  { value: '主角', hint: '默认男主主视角，推动主线', tier: 'lead' as const },
  { value: '主角团', hint: '女主/搭档等核心同伴（非主视角）', tier: 'party' as const },
  { value: '重要配角', hint: '强推动或情感线（含女主）', tier: 'support' as const },
  { value: '功能配角', hint: '过场、工具人', tier: 'support' as const },
  { value: '对手/反派', hint: '对立冲突来源', tier: 'antagonist' as const },
] as const;

export const STORY_CAMPS = [
  { value: '正派', hint: '站主角一侧', tone: 'good' as const },
  { value: '反派', hint: '对立或作恶', tone: 'evil' as const },
  { value: '中立', hint: '摇摆或旁观', tone: 'neutral' as const },
] as const;

export type StoryRole = (typeof STORY_ROLES)[number]['value'];
export type StoryCamp = (typeof STORY_CAMPS)[number]['value'];
export type RoleTier = 'lead' | 'party' | 'support' | 'antagonist';
export type CampTone = 'good' | 'evil' | 'neutral';

const ROLE_RANK: Record<string, number> = {
  主角: 0,
  女主角: 0,
  男主角: 0,
  主角团: 1,
  '对手/反派': 2,
  重要配角: 3,
  功能配角: 4,
};

/** 读取角色身份字段（兼容旧 storyRole） */
export function roleOfCharacter(row: any): string {
  const m = row?.meta || {};
  return String(m.role || m.storyRole || '').trim();
}

export function occupationOfCharacter(row: any): string {
  const m = row?.meta || {};
  return String(m.occupation || '').trim();
}

/**
 * 是否为标准「站位」身份（主角/配角等）。
 * 像「青云宗外门杂役」这类职务不算站位。
 */
export function isStandardStoryRole(role?: string): boolean {
  const r = String(role || '').trim();
  if (!r) return false;
  if (r === '女主角' || r === '男主角') return true;
  const n = normalizeStoryRole(r);
  return STORY_ROLES.some((x) => x.value === n);
}

/**
 * 旧身份 / 自由文本 → 标准身份（展示与分组用）。
 * 匹配顺序：配角类 → 主角团 → 反派 → 主角，避免「女主闺蜜」误判成主角。
 */
export function normalizeStoryRole(role?: string): string {
  const r = String(role || '').trim();
  if (!r) return '';
  if (r === '女主角' || r === '男主角') return '主角';
  if (STORY_ROLES.some((x) => x.value === r)) return r;

  if (/功能配角|路人|工具人/.test(r)) return '功能配角';
  if (/重要配角/.test(r)) return '重要配角';
  if (/配角/.test(r)) return '重要配角';
  if (/主角团|导师|盟友|闺蜜|搭档|队友|同伴/.test(r)) return '主角团';
  // 仅当身份本身在讲对立站位时才判反派，避免误伤人名/职务
  if (/^对手|^反派|对手\/反派|仇敌|反派头目|最终反派/.test(r)) return '对手/反派';
  if (/女主角|男主角|^主角$|女主$|男主$/.test(r)) return '主角';
  if (/主角/.test(r) && !/团|配/.test(r) && r.length <= 6) return '主角';
  return r;
}

function tierFromStandardRole(role: string): RoleTier | null {
  const norm = normalizeStoryRole(role);
  const hit = STORY_ROLES.find((x) => x.value === norm);
  return hit ? hit.tier : null;
}

function inferTierFromText(text: string): RoleTier | null {
  const t = String(text || '');
  if (!t.trim()) return null;
  if (/对手\/反派|^对手|^反派|仇敌|反派头目/.test(t)) return 'antagonist';
  if (/主角团|导师|盟友|闺蜜|搭档|队友/.test(t)) return 'party';
  if (/女主角|男主角|主视角|是男主|是女主|男主线|女主线/.test(t)) return 'lead';
  if (/(^|[^配])主角([^团配]|$)/.test(t) || /为本作主角|故事主角|男主角|女主角/.test(t)) {
    if (!/配角|不是主角/.test(t)) return 'lead';
  }
  if (/重要配角|功能配角|路人|工具人/.test(t)) return 'support';
  return null;
}

/** 根据站位身份推断分组；职务文本不会直接当成配角 */
export function roleTier(role?: string, hint?: string): RoleTier {
  const raw = String(role || '').trim();
  if (isStandardStoryRole(raw)) {
    return tierFromStandardRole(raw) || 'support';
  }

  // 非标准身份（多为职务）：结合简介判断，默认配角
  const inferred = inferTierFromText(`${raw} ${hint || ''}`);
  if (inferred) return inferred;
  return 'support';
}

export function roleTierOfCharacter(row: any, leadId?: string): RoleTier {
  if (leadId && row?.id === leadId) return 'lead';
  return roleTier(roleOfCharacter(row), `${row?.name || ''} ${row?.description || ''}`);
}

/**
 * 列表里还没有主角时，选出最像主视角的人（常见：大纲第一个、简介最长、职务写在 role 里）。
 */
export function pickLeadCandidate(rows: any[]): any | null {
  if (!rows?.length) return null;
  const already = rows.find((r) => roleTierOfCharacter(r) === 'lead');
  if (already) return already;

  let best: any = null;
  let bestScore = -Infinity;
  rows.forEach((row, index) => {
    const role = roleOfCharacter(row);
    const desc = String(row.description || '');
    const blob = `${role} ${desc}`;
    if (isStandardStoryRole(role) && roleTier(role) === 'antagonist') return;

    let score = 0;
    if (/主角|主视角|男主角|女主角/.test(blob) && !/配角|不是主角/.test(blob)) score += 100;
    if (!isStandardStoryRole(role) && role) score += 25; // 职务写在 role，常见于提取结果
    if (isStandardStoryRole(role) && roleTier(role) === 'party') score -= 30;
    if (isStandardStoryRole(role) && roleTier(role) === 'support') score -= 10;
    score += Math.max(0, 24 - index * 4); // 越靠前越高（提取顺序通常主角在前）
    score += Math.min(desc.length, 280) / 28;
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  });
  return best;
}

export function storyRoleRank(role?: string) {
  const r = normalizeStoryRole(role);
  if (ROLE_RANK[r] != null) return ROLE_RANK[r];
  const tier = roleTier(role);
  if (tier === 'lead') return 0;
  if (tier === 'party') return 1;
  if (tier === 'antagonist') return 2;
  return 3;
}

export function isLeadRole(role?: string) {
  return roleTier(role) === 'lead';
}

export function isPartyRole(role?: string) {
  return roleTier(role) === 'party';
}

export function normalizeStoryCamp(camp?: string): StoryCamp | '' {
  const c = String(camp || '').trim();
  if (c === '正派' || c === '反派' || c === '中立') return c;
  if (/正派|善|英雄|正义/.test(c) && !/反/.test(c)) return '正派';
  if (/反派|恶|邪|坏/.test(c)) return '反派';
  if (/中立|灰色|摇摆/.test(c)) return '中立';
  return '';
}

export function resolveStoryCamp(role?: string, camp?: string): StoryCamp {
  const explicit = normalizeStoryCamp(camp);
  if (explicit) return explicit;
  const tier = roleTier(role);
  if (tier === 'antagonist') return '反派';
  if (tier === 'lead' || tier === 'party') return '正派';
  return '中立';
}

export function campTone(role?: string, camp?: string): CampTone {
  const c = resolveStoryCamp(role, camp);
  if (c === '正派') return 'good';
  if (c === '反派') return 'evil';
  return 'neutral';
}

export function roleTierLabel(tier: RoleTier) {
  if (tier === 'lead') return '主角';
  if (tier === 'party') return '主角团';
  if (tier === 'support') return '配角';
  return '对手 / 反派';
}

/** 卡片上展示的站位文案 */
export function displayStoryRole(row: any, leadId?: string): string {
  if (leadId && row?.id === leadId) return '主角';
  const raw = roleOfCharacter(row);
  if (isStandardStoryRole(raw)) return normalizeStoryRole(raw);
  const tier = roleTierOfCharacter(row, leadId);
  if (tier === 'lead') return '主角';
  if (tier === 'party') return '主角团';
  if (tier === 'antagonist') return '对手/反派';
  return raw ? '配角（未标站位）' : '配角（未标）';
}

/** 积木多选时按顺序默认身份 */
export function defaultStoryRoleByIndex(index: number, total: number): StoryRole {
  if (index === 0) return '主角';
  if (index === 1) return total >= 3 ? '对手/反派' : '主角团';
  if (index === 2) return '主角团';
  if (index === 3) return '重要配角';
  return '功能配角';
}

export function suggestImportStoryRole(existingRoles: string[]): StoryRole {
  const hasLead = existingRoles.some((r) => roleTier(r) === 'lead');
  const hasParty = existingRoles.some((r) => roleTier(r) === 'party');
  const hasAntagonist = existingRoles.some((r) => roleTier(r) === 'antagonist');
  if (!hasLead) return '主角';
  if (!hasParty) return '主角团';
  if (!hasAntagonist) return '对手/反派';
  return '重要配角';
}

export function suggestImportStoryCamp(role?: string): StoryCamp {
  return resolveStoryCamp(role, '');
}
