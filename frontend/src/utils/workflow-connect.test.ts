import { describe, expect, it } from 'vitest';
import {
  acceptsTextPrompt,
  explainConnectReject,
  normalizeConnection,
  portColor,
} from './workflow-connect';

function node(id: string, nodeType: string) {
  return { id, data: { nodeType } } as never;
}

describe('acceptsTextPrompt / portColor', () => {
  it('图片/视频/Agent 可接收文案', () => {
    expect(acceptsTextPrompt('ai.image')).toBe(true);
    expect(acceptsTextPrompt('ai.video')).toBe(true);
    expect(acceptsTextPrompt('ai.chat')).toBe(true);
    expect(acceptsTextPrompt('output.preview')).toBe(true);
    expect(acceptsTextPrompt('input.text')).toBe(false);
  });

  it('未知端口类型回落 text 色', () => {
    expect(portColor('whatever')).toBe('#64748b');
  });
});

describe('normalizeConnection', () => {
  it('文本源连图片节点：无目标口时落到 image 口', () => {
    const conn = normalizeConnection(
      { source: 't1', target: 'i1' } as never,
      [node('t1', 'input.text'), node('i1', 'ai.image')] as never,
    );
    expect((conn as { targetHandle?: string }).targetHandle).toBe('image');
  });

  it('文本源带 prompt 口连图片：归一为 image 口', () => {
    const conn = normalizeConnection(
      { source: 't1', target: 'i1', targetHandle: 'prompt' } as never,
      [node('t1', 'input.text'), node('i1', 'ai.image')] as never,
    );
    expect((conn as { targetHandle?: string }).targetHandle).toBe('image');
  });

  it('文本源连文本节点：不重写目标口', () => {
    const conn = normalizeConnection(
      { source: 't1', target: 't2' } as never,
      [node('t1', 'input.text'), node('t2', 'input.text')] as never,
    );
    expect((conn as { targetHandle?: string }).targetHandle).toBeUndefined();
  });

  it('非文本源不重写目标口', () => {
    const conn = normalizeConnection(
      { source: 'i1', target: 'v1', targetHandle: 'image' } as never,
      [node('i1', 'ai.image'), node('v1', 'ai.video')] as never,
    );
    expect((conn as { targetHandle?: string }).targetHandle).toBe('image');
  });
});

describe('explainConnectReject', () => {
  it('拒绝自连并返回原因', () => {
    const res = explainConnectReject(
      { source: 't1', target: 't1' } as never,
      [node('t1', 'input.text')] as never,
      [] as never,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('self');
      expect(res.message).toContain('自己');
    }
  });
});
