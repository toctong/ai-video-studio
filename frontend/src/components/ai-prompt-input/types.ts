import type { JSONContent } from '@tiptap/core';

export type SelectTagOption = {
  label: string;
  value: string;
};

export type MentionAttrs = {
  label: string;
  mentionId?: string;
  expandText?: string;
  url?: string;
  mediaKind?: 'image' | 'video' | 'text';
};

export type InputTagAttrs = {
  label: string;
};

export type SelectTagAttrs = {
  value: string;
  options: SelectTagOption[];
};

/** 模板文档：TipTap JSON（doc） */
export type AiPromptTemplate = {
  id: string;
  label: string;
  description?: string;
  /** 技能分类（生成页 Agent 弹层筛选） */
  category?: string;
  content: JSONContent;
};

/** @deprecated 兼容旧命名，模板请用 content */
export type CustomElement = never;
