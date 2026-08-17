/** 全站技能类型（广场数据来自 Hub；本地不再内置模板目录） */
export type SkillCategory = 'story' | 'commerce' | 'design' | 'video' | 'image';

export type CatalogSkill = {
  id: string;
  name: string;
  desc: string;
  /** 挂到创作框的提示骨架；对话里可被 starter 覆盖 */
  prompt: string;
  category: SkillCategory;
  official?: boolean;
  author: string;
  likes: number;
  mode?: 'agent' | 'image' | 'video';
  /** 对话开场白；缺省用 prompt */
  starter?: string;
  /** `/slash` 短命令 */
  slash?: string;
  /** Hub 下发封面 */
  coverUrl?: string;
};

/** Hub 拉取后写入；默认空（不回填本地模板） */
let runtimeCatalog: CatalogSkill[] = [];

export function setRuntimeSkillCatalog(skills: CatalogSkill[]) {
  runtimeCatalog = skills.map((s) => ({
    ...s,
    starter: s.starter ?? s.prompt,
    slash: s.slash || s.id.replace(/[^a-z0-9]+/gi, '-').slice(0, 16),
  }));
}

export function getRuntimeSkillCatalog(): CatalogSkill[] {
  return runtimeCatalog.slice();
}

/** 本地模板已移除，恒为空；请用 getRuntimeSkillCatalog / Hub */
export const SKILL_CATALOG: CatalogSkill[] = [];

/** 本地模板已移除，恒为空；广场请 fetchSkillPlaza */
export const STUDIO_SKILLS: CatalogSkill[] = [];

export type StudioSkill = CatalogSkill;
export type ChatSkill = CatalogSkill;

/** 对话可用技能：Hub 运行时目录 */
export function listChatSkills(): CatalogSkill[] {
  return runtimeCatalog.slice();
}

/** @deprecated 请用 listChatSkills()；保留空数组避免误用本地模板 */
export const CHAT_SKILLS: ChatSkill[] = [];

export const STUDIO_SKILL_TABS = [
  { id: 'discover', label: '发现' },
  { id: 'skill', label: '技能' },
  { id: 'workflow', label: '工作流' },
  { id: 'shots', label: '镜头库' },
] as const;

export type PlazaTab = (typeof STUDIO_SKILL_TABS)[number]['id'];

export const CHAT_SKILL_CATEGORIES: { id: SkillCategory | 'all'; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'story', label: '剧情' },
  { id: 'image', label: '出图' },
  { id: 'video', label: '视频' },
  { id: 'design', label: '设计' },
  { id: 'commerce', label: '电商' },
];

export const CHAT_STARTERS = [
  { id: 'plot', label: '聊聊整体剧情', skillId: 'plot-architect' },
  { id: 'cast', label: '写角色圣经', skillId: 'character-bible' },
  { id: 'shots', label: '分镜速览', skillId: 'shot-table' },
  { id: 'image', label: '写出生图提示词', skillId: 'image-prompt-pro' },
  { id: 'hook', label: '打磨前三秒钩子', skillId: 'hook-rewriter' },
] as const;

export function findSkill(id: string): CatalogSkill | undefined {
  return runtimeCatalog.find((s) => s.id === id);
}

export function findChatSkill(id: string): CatalogSkill | null {
  return findSkill(id) || null;
}

export function matchSlashSkill(input: string): ChatSkill | null {
  const m = input.trim().match(/^\/([a-z0-9_-]+)\s*/i);
  if (!m) return null;
  const key = m[1].toLowerCase();
  return (
    listChatSkills().find(
      (s) => s.slash?.toLowerCase() === key || s.id.toLowerCase() === key,
    ) || null
  );
}

export function skillPromptText(skill: CatalogSkill): string {
  return String(skill.starter || skill.prompt || '').trim();
}
