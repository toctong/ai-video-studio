import type { WorkflowNodeState } from '@ai-video-studio/shared';

/**
 * 全量/续跑时是否复用上次节点输出（与 GraphExecutor 行为一致）。
 */
export function shouldReusePriorNode(
  type: string | undefined,
  st?: WorkflowNodeState,
): boolean {
  if (!st || st.status !== 'completed' || !st.outputs) return false;
  const outs = st.outputs;
  if (!Object.keys(outs).length) return false;
  const t = String(type || '');
  // 文本类每次重跑（便宜，且用户常改提示词）
  if (t === 'input.text' || t === 'input.note') return false;
  // 生图 / 媒体输入：有图或视频输出才跳过，避免再烧一遍
  if (t === 'ai.image' || t === 'input.image') {
    return Boolean(String(outs.image || '').trim());
  }
  if (t === 'ai.video' || t === 'input.video') {
    return Boolean(String(outs.video || '').trim());
  }
  return true;
}

export type LayerRunDecision = 'run' | 'skip-reuse' | 'skip-out-of-scope';

/**
 * onlyNodeId / fromNodeId 下某节点是否应执行。
 * skip-reuse：标记为复用上次结果；skip-out-of-scope：本轮不碰。
 */
export function decideNodeRun(opts: {
  nodeId: string;
  nodeType?: string;
  onlyId?: string;
  fromId?: string;
  ancestorsOfOnly?: Set<string> | null;
  ancestorsUntilFrom?: Set<string> | null;
  prior?: WorkflowNodeState;
}): LayerRunDecision {
  const onlyId = String(opts.onlyId || '').trim();
  const fromId = String(opts.fromId || '').trim();
  const { nodeId, nodeType, prior, ancestorsOfOnly, ancestorsUntilFrom } = opts;

  if (onlyId && ancestorsOfOnly) {
    if (nodeId === onlyId) return 'run';
    if (ancestorsOfOnly.has(nodeId)) {
      return shouldReusePriorNode(nodeType, prior) ? 'skip-reuse' : 'run';
    }
    return 'skip-out-of-scope';
  }

  if (ancestorsUntilFrom && ancestorsUntilFrom.has(nodeId)) {
    return shouldReusePriorNode(nodeType, prior) ? 'skip-reuse' : 'run';
  }

  if (!fromId && !onlyId && shouldReusePriorNode(nodeType, prior)) {
    return 'skip-reuse';
  }

  return 'run';
}
