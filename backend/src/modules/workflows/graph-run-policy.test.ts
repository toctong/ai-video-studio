import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compileDocumentToPrompt,
  emptyWorkflowDocument,
  promptCollectAncestors,
  type CatalogPortLookup,
  type WorkflowDocument,
  type WorkflowNodeState,
} from '@ai-video-studio/shared';
import { decideNodeRun, shouldReusePriorNode } from './graph-run-policy';

const CATALOG: CatalogPortLookup[] = [
  {
    type: 'input.text',
    inputs: [],
    outputs: [{ id: 'text', label: '文本', type: 'text' }],
  },
  {
    type: 'ai.image',
    inputs: [{ id: 'prompt', label: '提示', type: 'text', optional: true }],
    outputs: [{ id: 'image', label: '图片', type: 'image' }],
  },
];

describe('graph-run-policy only/from-node', () => {
  const graph: WorkflowDocument = {
    ...emptyWorkflowDocument(),
    nodes: [
      { id: 't1', type: 'input.text', position: { x: 0, y: 0 }, params: {} },
      { id: 'i1', type: 'ai.image', position: { x: 100, y: 0 }, params: {} },
    ],
    edges: [
      {
        id: 'e1',
        source: 't1',
        sourceHandle: 'text',
        target: 'i1',
        targetHandle: 'prompt',
      },
    ],
  };

  const prompt = compileDocumentToPrompt(graph, CATALOG);
  const ancestors = promptCollectAncestors(prompt, 'i1');

  it('onlyNodeId runs target; text ancestors are not reused', () => {
    const prior: Record<string, WorkflowNodeState> = {
      t1: { status: 'completed', outputs: { text: 'hi' } },
      i1: { status: 'completed', outputs: { image: 'http://x/a.png' } },
    };
    assert.equal(
      decideNodeRun({
        nodeId: 't1',
        onlyId: 'i1',
        ancestorsOfOnly: ancestors,
        nodeType: 'input.text',
        prior: prior.t1,
      }),
      'run',
    );
    assert.equal(
      decideNodeRun({
        nodeId: 'i1',
        onlyId: 'i1',
        ancestorsOfOnly: ancestors,
        nodeType: 'ai.image',
        prior: prior.i1,
      }),
      'run',
    );
  });

  it('fromNodeId keeps target runnable', () => {
    const until = promptCollectAncestors(prompt, 'i1');
    assert.equal(
      decideNodeRun({
        nodeId: 't1',
        fromId: 'i1',
        ancestorsUntilFrom: until,
        nodeType: 'input.text',
        prior: { status: 'completed', outputs: { text: 'x' } },
      }),
      'run',
    );
    assert.equal(
      decideNodeRun({
        nodeId: 'i1',
        fromId: 'i1',
        ancestorsUntilFrom: until,
        nodeType: 'ai.image',
        prior: { status: 'completed', outputs: { image: 'http://x/a.png' } },
      }),
      'run',
    );
  });

  it('full run reuses completed media nodes', () => {
    assert.equal(
      decideNodeRun({
        nodeId: 'i1',
        nodeType: 'ai.image',
        prior: { status: 'completed', outputs: { image: 'http://x/a.png' } },
      }),
      'skip-reuse',
    );
    assert.equal(
      decideNodeRun({
        nodeId: 'i1',
        nodeType: 'ai.image',
        prior: { status: 'failed', message: 'boom' },
      }),
      'run',
    );
  });

  it('shouldReusePriorNode matches media/text rules', () => {
    assert.equal(
      shouldReusePriorNode('input.text', {
        status: 'completed',
        outputs: { text: 'a' },
      }),
      false,
    );
    assert.equal(
      shouldReusePriorNode('ai.image', {
        status: 'completed',
        outputs: { image: 'http://x/a.png' },
      }),
      true,
    );
    assert.equal(
      shouldReusePriorNode('ai.image', { status: 'completed', outputs: {} }),
      false,
    );
  });
});
