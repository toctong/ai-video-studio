import { describe, expect, it } from 'vitest';
import {
  clampBookScale,
  formatBookScaleIdeaBlock,
  formatBookScaleLabel,
  matchBookScalePreset,
} from './book-scale';

describe('clampBookScale', () => {
  it('限幅 30–500 万字、3–20 卷', () => {
    expect(clampBookScale({ wordsWan: 10, volumes: 1 })).toEqual({ wordsWan: 30, volumes: 3 });
    expect(clampBookScale({ wordsWan: 999, volumes: 99 })).toEqual({ wordsWan: 500, volumes: 20 });
  });

  it('缺省用默认 150 万 / 7 卷', () => {
    expect(clampBookScale(null)).toEqual({ wordsWan: 150, volumes: 7 });
  });
});

describe('formatBookScaleLabel / idea', () => {
  it('生成符合大纲解析约定的字样', () => {
    expect(formatBookScaleLabel({ wordsWan: 120, volumes: 6 })).toBe('预估成书约 120 万字 · 6 卷');
    const idea = formatBookScaleIdeaBlock({ wordsWan: 120, volumes: 6 });
    expect(idea).toContain('预估成书约 120 万字 · 6 卷');
    expect(idea).toContain('禁止把大纲文档字数写成');
  });
});

describe('matchBookScalePreset', () => {
  it('命中预设返回 id，否则 custom', () => {
    expect(matchBookScalePreset({ wordsWan: 200, volumes: 8 })).toBe('200-8');
    expect(matchBookScalePreset({ wordsWan: 210, volumes: 8 })).toBe('custom');
  });
});
