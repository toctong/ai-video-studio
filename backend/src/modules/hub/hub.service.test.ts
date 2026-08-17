import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  maskKey,
  normalizeHubCatalogItem,
  normalizeHubCatalogPayload,
} from './hub.service';

describe('maskKey', () => {
  it('长密钥保留首尾各 4 位', () => {
    assert.equal(maskKey('abcdefghijkl'), 'abcd****ijkl');
  });

  it('短密钥全部打码', () => {
    assert.equal(maskKey('abc'), '****');
  });

  it('空值返回空串', () => {
    assert.equal(maskKey(''), '');
  });
});

describe('normalizeHubCatalogPayload', () => {
  it('接受裸数组', () => {
    const out = normalizeHubCatalogPayload([{ id: 'a' }], 'channel');
    assert.equal(out.items.length, 1);
    assert.equal(out.items[0].id, 'a');
  });

  it('兼容 items / channels / models / data 字段', () => {
    const byItems = normalizeHubCatalogPayload({ version: 3, items: [{ id: 'x' }] }, 'channel');
    assert.equal(byItems.items.length, 1);
    const byChannels = normalizeHubCatalogPayload({ channels: [{ slug: 'volc' }] }, 'channel');
    assert.equal(byChannels.items[0].slug, 'volc');
    const byData = normalizeHubCatalogPayload({ data: [{ modelId: 'm1' }] }, 'model');
    assert.equal(byData.items[0].modelId, 'm1');
  });

  it('把 baseUrl 归一为 baseUrlHint 并去尾部斜杠', () => {
    const out = normalizeHubCatalogPayload(
      { items: [{ baseUrl: 'https://example.com///' }] },
      'channel',
    );
    assert.equal(out.items[0].baseUrlHint, 'https://example.com');
  });
});

describe('normalizeHubCatalogItem', () => {
  it('model 的 channel 字段映射为 channelSlug', () => {
    const item = normalizeHubCatalogItem({ channel: 'volc' }, 'model');
    assert.equal(item.channelSlug, 'volc');
  });

  it('非对象输入返回空对象', () => {
    assert.deepEqual(normalizeHubCatalogItem(null, 'model'), {});
  });
});
