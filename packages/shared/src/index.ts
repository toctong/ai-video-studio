export * from './ai-providers';
export * from './workflow';
export * from './image-grid';
export * from './comfy';

export const PLUGIN_IDS = [
  'llm-chat',
  'mcp-assemble',
  'mcp-outline',
  'mcp-logline',
  'mcp-trope',
  'mcp-chapter',
  'mcp-deai',
  'mcp-dialogue',
  'mcp-pacing',
  'mcp-bible',
  'mcp-continuity',
  'mcp-export',
  'mcp-scrivener',
] as const;

export type PluginId = (typeof PLUGIN_IDS)[number];

export const ASSET_TYPES = [
  'script',
  'style',
  'character_ref',
  'scene',
  'prop',
  'pose',
  'fx',
  'expression',
  'voice',
  'keyframe',
  'storyboard',
  'video',
  'narration',
  'dialogue',
  'bgm',
  'sfx',
  'subtitle',
  'export',
  'cover',
  'other',
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

export const PROJECT_STAGES = ['script'] as const;

export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const STAGE_LABELS: Record<ProjectStage, string> = {
  script: '写作',
};

export type JobStatus = 'queued' | 'active' | 'completed' | 'failed' | 'cancelled';

/** M10：仅保留主路径任务类型；旧 JobKind 已从库中清除 */
export type JobKind =
  | 'script_generate'
  | 'chapter_generate'
  | 'chapter_deai'
  | 'cover_generate'
  | 'timeline_export'
  | 'workflow_run'
  /** 生成页：会话出图（可刷新恢复） */
  | 'studio_generate_image'
  /** 生成页：会话出视频（可刷新恢复） */
  | 'studio_generate_video';

/** 资产 meta.role 约定（工作室产出 / 书库 / 封面等） */
export type AssetMetaRole =
  | 'output'
  | 'reference'
  | 'cover'
  | 'script'
  | 'export'
  | 'library';

/** 章节卡：写正文前的细纲 */
export type ChapterCard = {
  goal?: string;
  cast?: string;
  keyEvents?: string[];
  hook?: string;
  mainPlotLink?: string;
};

export type StoryOpenHook = {
  id: string;
  text: string;
  chapterOrder?: number;
};

/** 分章时间线条目（AI 在每章写完后维护） */
export type StoryTimelineEntry = {
  id: string;
  chapterId?: string;
  chapterOrder: number;
  chapterTitle?: string;
  /** 故事内时间点，如「入宗第三日黄昏」 */
  when?: string;
  /** 地点 */
  where?: string;
  /** 本章关键节点 */
  events?: string[];
  /** 一句话纪要 */
  summary?: string;
};

export type ProjectStoryState = {
  openHooks?: StoryOpenHook[];
  /** 项目级时间线总览速记 */
  timelineNote?: string;
  /** 按章序排列的时间线节点 */
  timeline?: StoryTimelineEntry[];
  /** 预估成书总字数（万字），创建时用户指定 */
  targetWordsWan?: number;
  /** 建议卷数 */
  volumeCount?: number;
};

/** 人物圣经 / 出图用设定（存 Character.meta） */
export type CharacterBibleMeta = {
  role?: string;
  /** 门派职务 / 社会身份（与 role 站位分开） */
  occupation?: string;
  camp?: string;
  appearance?: {
    morphology?: string;
    face?: string;
    body?: string;
    costume?: string;
    colors?: string;
    /** 伤疤、配饰等可复现标志 */
    marks?: string;
  };
  voiceStyle?: string;
  oocNever?: string;
  imagePromptZh?: string;
  imagePromptEn?: string;
  currentState?: {
    location?: string;
    condition?: string;
    inventory?: string;
    mood?: string;
  };
  source?: string;
};

export interface ProjectProgress {
  script: boolean;
  /** @deprecated 已下线，兼容旧数据 */
  image?: boolean;
  video?: boolean;
  voice?: boolean;
  music?: boolean;
  edit?: boolean;
}
