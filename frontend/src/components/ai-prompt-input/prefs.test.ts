import { describe, expect, it } from 'vitest';
import {
  aiModelsToPrefOptions,
  createDefaultPrefs,
  normalizeVideoDuration,
  prefsToImageSize,
} from './prefs';

describe('normalizeVideoDuration', () => {
  it('吸附到 5 / 10 / 15 / 30', () => {
    expect(normalizeVideoDuration(7)).toBe(5);
    expect(normalizeVideoDuration(12)).toBe(10);
    expect(normalizeVideoDuration(17)).toBe(15);
    expect(normalizeVideoDuration(40)).toBe(30);
  });

  it('非法值用 fallback', () => {
    expect(normalizeVideoDuration(NaN, 15)).toBe(15);
    expect(normalizeVideoDuration(-3, 10)).toBe(10);
  });
});

describe('prefsToImageSize', () => {
  it('横版 / 竖版 / 方图映射', () => {
    const base = { ...createDefaultPrefs({ mediaKind: 'image' }), auto: false };
    expect(prefsToImageSize({ ...base, aspectRatio: '16:9' })).toBe('1792x1024');
    expect(prefsToImageSize({ ...base, aspectRatio: '9:16' })).toBe('1024x1792');
    expect(prefsToImageSize({ ...base, aspectRatio: '1:1' })).toBe('1024x1024');
  });
});

describe('createDefaultPrefs', () => {
  it('视频默认 480p + omni 参考', () => {
    const prefs = createDefaultPrefs({ mediaKind: 'video' });
    expect(prefs.quality).toBe('480p');
    expect(prefs.refMode).toBe('omni');
  });

  it('图片默认 1.5k', () => {
    expect(createDefaultPrefs({ mediaKind: 'image' }).quality).toBe('1.5k');
  });
});

describe('aiModelsToPrefOptions', () => {
  it('推荐/旗舰模型打角标', () => {
    const options = aiModelsToPrefOptions([
      { label: 'A', value: 'a', recommended: true },
      { label: 'B', value: 'b', tags: ['旗舰'] },
      { label: 'C', value: 'c' },
    ]);
    expect(options[0].badge).toBe('荐');
    expect(options[1].badge).toBe('New');
    expect(options[2].badge).toBeUndefined();
  });
});
