import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compileDocumentToPrompt,
  documentToGraphCompat,
  emptyWorkflowDocument,
  migrateGraphV1ToDocument,
  promptCollectAncestors,
  promptTopoLayers,
  pruneWorkflowDocument,
  sanitizeWorkflowDocumentForPersist,
  WorkflowDocumentSanitizeError,
  type CatalogPortLookup,
  type WorkflowDocument,
} from './workflow';

const CATALOG: CatalogPortLookup[] = [
  {
    type: 'input.text',
    inputs: [
      { id: 'text', label: '文本', type: 'text', optional: true },
      { id: 'image', label: '参考图', type: 'image', optional: true },
    ],
    outputs: [{ id: 'text', label: '文本', type: 'text' }],
  },
  {
    type: 'ai.image',
    inputs: [
      { id: 'prompt', label: '提示', type: 'text', optional: true },
      { id: 'image', label: '参考图', type: 'image', optional: true },
    ],
    outputs: [{ id: 'image', label: '图片', type: 'image' }],
  },
  {
    type: 'ai.video',
    inputs: [
      { id: 'prompt', label: '提示', type: 'text', optional: true },
      { id: 'image', label: '首帧', type: 'image', optional: true },
    ],
    outputs: [{ id: 'video', label: '视频', type: 'video' }],
  },
];

function doc(partial: Partial<WorkflowDocument>): WorkflowDocument {
  return {
    ...emptyWorkflowDocument(),
    ...partial,
    schemaVersion: 2,
  };
}

describe('compileDocumentToPrompt', () => {
  it('compiles text → image → video chain', () => {
    const graph = doc({
      nodes: [
        {
          id: 't1',
          type: 'input.text',
          position: { x: 0, y: 0 },
          params: { value: 'hello' },
        },
        { id: 'i1', type: 'ai.image', position: { x: 200, y: 0 }, params: {} },
        { id: 'v1', type: 'ai.video', position: { x: 400, y: 0 }, params: {} },
      ],
      edges: [
        {
          id: 'e1',
          source: 't1',
          sourceHandle: 'text',
          target: 'i1',
          targetHandle: 'prompt',
        },
        {
          id: 'e2',
          source: 'i1',
          sourceHandle: 'image',
          target: 'v1',
          targetHandle: 'image',
        },
      ],
    });
    const prompt = compileDocumentToPrompt(graph, CATALOG);
    assert.equal(Object.keys(prompt.nodes).length, 3);
    assert.deepEqual(prompt.nodes.i1.inputs.prompt, { nodeId: 't1', port: 'text' });
    assert.deepEqual(prompt.nodes.v1.inputs.image, { nodeId: 'i1', port: 'image' });

    const layers = promptTopoLayers(prompt);
    assert.deepEqual(layers[0], ['t1']);
    assert.ok(layers.some((layer) => layer.includes('i1')));
    assert.ok(layers.some((layer) => layer.includes('v1')));

    const ancestors = promptCollectAncestors(prompt, 'v1');
    assert.ok(ancestors.has('i1'));
    assert.ok(ancestors.has('t1'));
    assert.equal(ancestors.has('v1'), false);
  });

  it('rejects unknown node types', () => {
    const graph = doc({
      nodes: [{ id: 'x', type: 'drama.legacy', position: { x: 0, y: 0 }, params: {} }],
    });
    assert.throws(
      () => compileDocumentToPrompt(graph, CATALOG),
      /未知工作流节点类型/,
    );
  });

  it('rejects unknown output ports', () => {
    const graph = doc({
      nodes: [
        { id: 'i1', type: 'ai.image', position: { x: 0, y: 0 }, params: {} },
        { id: 't1', type: 'input.text', position: { x: 200, y: 0 }, params: {} },
      ],
      edges: [
        {
          id: 'bad',
          source: 'i1',
          sourceHandle: 'nope',
          target: 't1',
          targetHandle: 'text',
        },
      ],
    });
    assert.throws(() => compileDocumentToPrompt(graph, CATALOG), /未知输出端口/);
  });

  it('rejects cycles', () => {
    const graph = doc({
      nodes: [
        { id: 'a', type: 'input.text', position: { x: 0, y: 0 }, params: {} },
        { id: 'b', type: 'ai.image', position: { x: 100, y: 0 }, params: {} },
      ],
      edges: [
        {
          id: 'e1',
          source: 'a',
          sourceHandle: 'text',
          target: 'b',
          targetHandle: 'prompt',
        },
        {
          id: 'e2',
          source: 'b',
          sourceHandle: 'image',
          target: 'a',
          targetHandle: 'image',
        },
      ],
    });
    assert.throws(() => compileDocumentToPrompt(graph, CATALOG), /环路/);
  });
});

describe('sanitizeWorkflowDocumentForPersist', () => {
  it('prunes unknown types then returns compilable doc', () => {
    const graph = doc({
      nodes: [
        { id: 't1', type: 'input.text', position: { x: 0, y: 0 }, params: {} },
        { id: 'old', type: 'drama.gone', position: { x: 1, y: 1 }, params: {} },
      ],
      edges: [
        {
          id: 'e1',
          source: 't1',
          sourceHandle: 'text',
          target: 'old',
          targetHandle: 'x',
        },
      ],
    });
    const out = sanitizeWorkflowDocumentForPersist(graph, CATALOG);
    assert.equal(out.nodes.length, 1);
    assert.equal(out.nodes[0].id, 't1');
    assert.equal(out.edges.length, 0);
  });

  it('throws instead of silently dropping bad edges', () => {
    const graph = doc({
      nodes: [
        { id: 't1', type: 'input.text', position: { x: 0, y: 0 }, params: {} },
        { id: 'i1', type: 'ai.image', position: { x: 200, y: 0 }, params: {} },
      ],
      edges: [
        {
          id: 'bad',
          source: 't1',
          sourceHandle: 'missing',
          target: 'i1',
          targetHandle: 'prompt',
        },
      ],
    });
    assert.throws(
      () => sanitizeWorkflowDocumentForPersist(graph, CATALOG),
      (err: unknown) => {
        assert.ok(err instanceof WorkflowDocumentSanitizeError);
        assert.match(String(err.message), /无法保存/);
        return true;
      },
    );
  });
});

describe('pruneWorkflowDocument', () => {
  it('keeps only allow-listed types', () => {
    const graph = doc({
      nodes: [
        { id: 't1', type: 'input.text', position: { x: 0, y: 0 }, params: {} },
        { id: 'i1', type: 'ai.image', position: { x: 0, y: 0 }, params: {} },
      ],
    });
    const out = pruneWorkflowDocument(graph, ['input.text']);
    assert.deepEqual(
      out.nodes.map((n) => n.type),
      ['input.text'],
    );
  });
});

describe('migrateGraphV1ToDocument', () => {
  it('空值回落到空 Document v2', () => {
    const out = migrateGraphV1ToDocument(null);
    assert.equal(out.schemaVersion, 2);
    assert.equal(out.nodes.length, 0);
  });

  it('v1 图（无 schemaVersion）迁移为 v2，并把 disabled 节点标为 mute', () => {
    const out = migrateGraphV1ToDocument(
      {
        nodes: [
          { id: 't1', type: 'input.text', position: { x: 0, y: 0 }, params: {}, disabled: true },
          { id: 'i1', type: 'ai.image', position: { x: 100, y: 0 }, params: {} },
        ],
        edges: [],
      } as never,
    );
    assert.equal(out.schemaVersion, 2);
    assert.equal((out.groups || []).length, 0);
    assert.equal(out.nodes.find((n) => n.id === 't1')?.mode, 'mute');
    assert.equal(out.nodes.find((n) => n.id === 'i1')?.mode, 'active');
  });

  it('v2 文档透传并补齐 mode', () => {
    const src = doc({ nodes: [{ id: 'x', type: 'input.text', position: { x: 0, y: 0 }, params: {} }] });
    const out = migrateGraphV1ToDocument(src);
    assert.equal(out.schemaVersion, 2);
    assert.equal(out.nodes[0].mode, 'active');
  });

  it('documentToGraphCompat 保持 schemaVersion 2', () => {
    const src = doc({ nodes: [] });
    const out = documentToGraphCompat(src);
    assert.equal(out.schemaVersion, 2);
  });
});
