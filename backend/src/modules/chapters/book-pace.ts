import type { ProjectStoryState } from '@ai-video-studio/shared';

export type BookPacePhase = 'build' | 'wrap' | 'finale';

export type BookPace = {
  phase: BookPacePhase;
  /** 已写 / 目标 */
  ratio: number;
  writtenWords: number;
  targetWords: number;
  remainingWords: number;
  label: string;
  /** 注入 system / user 的写作约束 */
  rules: string[];
};

const DEFAULT_TARGET_WORDS = 1_500_000; // 150 万

/** 从 storyState / 大纲文案解析成书目标（汉字数） */
export function resolveTargetWords(opts: {
  storyState?: ProjectStoryState | null;
  outline?: string;
}): number {
  const wan = Number(opts.storyState?.targetWordsWan);
  if (Number.isFinite(wan) && wan >= 10) {
    return Math.round(Math.min(500, Math.max(30, wan)) * 10_000);
  }
  const outline = String(opts.outline || '');
  const m =
    outline.match(/预估成书约\s*(\d+(?:\.\d+)?)\s*万字/) ||
    outline.match(/成书约\s*(\d+(?:\.\d+)?)\s*万字/) ||
    outline.match(/约\s*(\d+(?:\.\d+)?)\s*万字\s*[·・]\s*\d+\s*卷/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 10) {
      return Math.round(Math.min(500, Math.max(30, n)) * 10_000);
    }
  }
  return DEFAULT_TARGET_WORDS;
}

export function sumChapterWords(
  chapters: Array<{ novelBody?: string | null; orderIndex?: number }>,
  beforeOrder?: number,
): number {
  return chapters.reduce((sum, c) => {
    if (beforeOrder != null && Number(c.orderIndex || 0) >= beforeOrder) return sum;
    return sum + String(c.novelBody || '').length;
  }, 0);
}

/**
 * 根据已写字数相对成书目标，判断是否进入收束 / 完结阶段。
 * - wrap：约 ≥82% 或剩余不足约 12 万字 → 开始收钩、少埋新大悬念
 * - finale：约 ≥95% 或剩余不足约 1.2 万字 → 按完结章收主线
 */
export function resolveBookPace(opts: {
  writtenWords: number;
  targetWords: number;
  /** 用户显式要求完结 */
  forceFinale?: boolean;
  /** 中间章重写且有后文约束时，不强行完结 */
  hasSubsequentConstraint?: boolean;
}): BookPace {
  const targetWords = Math.max(opts.targetWords || DEFAULT_TARGET_WORDS, 50_000);
  const writtenWords = Math.max(0, Math.round(opts.writtenWords || 0));
  const remainingWords = Math.max(0, targetWords - writtenWords);
  const ratio = writtenWords / targetWords;
  const pct = Math.min(99, Math.round(ratio * 100));

  if (opts.forceFinale && !opts.hasSubsequentConstraint) {
    return {
      phase: 'finale',
      ratio,
      writtenWords,
      targetWords,
      remainingWords,
      label: '完结收束',
      rules: finaleRules(writtenWords, targetWords, remainingWords),
    };
  }

  if (opts.hasSubsequentConstraint) {
    return {
      phase: 'build',
      ratio,
      writtenWords,
      targetWords,
      remainingWords,
      label: '桥接重写',
      rules: [],
    };
  }

  const nearFinale = ratio >= 0.95 || remainingWords <= 12_000;
  const nearWrap = ratio >= 0.82 || remainingWords <= 120_000;

  if (nearFinale) {
    return {
      phase: 'finale',
      ratio,
      writtenWords,
      targetWords,
      remainingWords,
      label: `接近目标字数（已写约 ${pct}%）· 完结收束`,
      rules: finaleRules(writtenWords, targetWords, remainingWords),
    };
  }

  if (nearWrap) {
    return {
      phase: 'wrap',
      ratio,
      writtenWords,
      targetWords,
      remainingWords,
      label: `接近目标字数（已写约 ${pct}%）· 开始收束`,
      rules: wrapRules(writtenWords, targetWords, remainingWords),
    };
  }

  return {
    phase: 'build',
    ratio,
    writtenWords,
    targetWords,
    remainingWords,
    label: `连载推进（已写约 ${pct}%）`,
    rules: [
      `【篇幅进度】已写约 ${formatWan(writtenWords)}，目标约 ${formatWan(targetWords)}，仍可正常推进主线与埋伏笔。`,
    ],
  };
}

function formatWan(n: number): string {
  if (n >= 10_000) return `${(n / 10_000).toFixed(n >= 100_000 ? 0 : 1)} 万字`;
  return `${n} 字`;
}

function wrapRules(written: number, target: number, remaining: number): string[] {
  return [
    `【篇幅收束期】已写约 ${formatWan(written)} / 目标 ${formatWan(target)}，剩余约 ${formatWan(remaining)}。从本章起进入全书收尾节奏。`,
    '优先兑现、消化【未收束钩子】与前文悬念、伏笔、人物承诺；能收的先收，不要再堆长线谜团。',
    '可以保留少量过渡性小钩子，但禁止新开无关大支线、新终极反派、新世界观大设定。',
    '主线、感情线、势力线都要明显往结局推进；章末钩子以「推进收束」为主，少用「全新更大危机」吊胃口。',
    '细纲 goal / keyEvents 至少消化 1～2 条未收钩子或旧悬念。',
  ];
}

function finaleRules(written: number, target: number, remaining: number): string[] {
  return [
    `【完结收束】已写约 ${formatWan(written)} / 目标 ${formatWan(target)}，剩余约 ${formatWan(remaining)}。本章按完结章写。`,
    '必须收束主线与核心人物弧光，兑现前文承诺；尽量清空【未收束钩子】。',
    '禁止新开大悬念、新反派、新主线；可写短暂余韵，不要吊胃口式断章。',
    'openHooks 必须为空；hook 留空或极短余韵；结局落点写清。',
  ];
}
