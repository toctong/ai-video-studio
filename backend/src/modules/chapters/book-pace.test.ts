import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  resolveBookPace,
  resolveTargetWords,
  sumChapterWords,
} from './book-pace';

describe('resolveTargetWords', () => {
  it('优先用 storyState.targetWordsWan（限幅 30–500 万）', () => {
    assert.equal(resolveTargetWords({ storyState: { targetWordsWan: 120 } }), 1_200_000);
    assert.equal(resolveTargetWords({ storyState: { targetWordsWan: 8 } }), 1_500_000);
    assert.equal(resolveTargetWords({ storyState: { targetWordsWan: 600 } }), 5_000_000);
  });

  it('从大纲「预估成书约 X 万字」解析', () => {
    assert.equal(
      resolveTargetWords({ outline: '预估成书约 80 万字 · 3 卷' }),
      800_000,
    );
  });

  it('解析不到时回落到默认 150 万字', () => {
    assert.equal(resolveTargetWords({ outline: '短篇练习' }), 1_500_000);
  });
});

describe('sumChapterWords', () => {
  it('统计 beforeOrder 之前的正文字数', () => {
    const chapters = [
      { novelBody: '一二三四五', orderIndex: 1 },
      { novelBody: '六七八九十', orderIndex: 2 },
      { novelBody: '超长待续', orderIndex: 3 },
    ];
    assert.equal(sumChapterWords(chapters, 3), 10);
    assert.equal(sumChapterWords(chapters), 14);
  });
});

describe('resolveBookPace', () => {
  it('连载期 build', () => {
    const pace = resolveBookPace({ writtenWords: 300_000, targetWords: 1_500_000 });
    assert.equal(pace.phase, 'build');
    assert.ok(pace.rules.length > 0);
  });

  it('约 90% 进入收束 wrap', () => {
    const pace = resolveBookPace({ writtenWords: 1_350_000, targetWords: 1_500_000 });
    assert.equal(pace.phase, 'wrap');
  });

  it('≥95% 进入完结 finale', () => {
    const pace = resolveBookPace({ writtenWords: 1_430_000, targetWords: 1_500_000 });
    assert.equal(pace.phase, 'finale');
  });

  it('剩余不足 12 万字也触发 finale', () => {
    const pace = resolveBookPace({ writtenWords: 1_490_000, targetWords: 1_500_000 });
    assert.equal(pace.phase, 'finale');
  });

  it('显式要求完结时强制 finale', () => {
    const pace = resolveBookPace({
      writtenWords: 100_000,
      targetWords: 1_500_000,
      forceFinale: true,
    });
    assert.equal(pace.phase, 'finale');
  });

  it('有后文约束时保持桥接重写，不强行完结', () => {
    const pace = resolveBookPace({
      writtenWords: 1_430_000,
      targetWords: 1_500_000,
      forceFinale: true,
      hasSubsequentConstraint: true,
    });
    assert.equal(pace.phase, 'build');
    assert.equal(pace.label, '桥接重写');
  });
});
