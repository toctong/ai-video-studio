import { computed, onBeforeUnmount, ref, type Ref } from 'vue';
import {
  fetchWorkflowRun,
  watchWorkflowRun,
  type WorkflowRunRow,
} from '@/api/workflows';

export type CanvasLiveRunHooks = {
  activeRun: Ref<WorkflowRunRow | null>;
  /** 是否把节点算作 busy（running / queued…） */
  isNodeBusyStatus: (status?: string) => boolean;
  applyNodeStates: (states: Record<string, unknown> | undefined, runId?: string) => void;
  finishNodeRun: (onlyNodeId: string, workflowRun: WorkflowRunRow) => void;
  toastCompleted: (states?: Record<string, unknown>) => void;
  notifyError: (raw?: string) => void;
};

function isTerminalRunStatus(status?: string) {
  return ['completed', 'failed', 'cancelled'].includes(String(status || ''));
}

/**
 * 画布多路运行态：SSE / 轮询订阅、liveRun 焦点与节点占用。
 */
export function useCanvasLiveRuns(hooks: CanvasLiveRunHooks) {
  const liveRunFocus = ref<Record<string, string>>({});
  const liveNodeRuns = ref<Record<string, string>>({});
  const pendingCancelNodeIds = new Set<string>();

  const runWatchAborts = new Map<string, AbortController>();
  const runPollTimers = new Map<string, ReturnType<typeof setInterval>>();

  const liveRunCount = computed(() => Object.keys(liveRunFocus.value).length);
  const running = computed(() => liveRunCount.value > 0);

  function stopWatch(runId: string) {
    const ac = runWatchAborts.get(runId);
    if (ac) {
      ac.abort();
      runWatchAborts.delete(runId);
    }
    const timer = runPollTimers.get(runId);
    if (timer) {
      clearInterval(timer);
      runPollTimers.delete(runId);
    }
  }

  function stopAllWatches() {
    for (const id of [...runWatchAborts.keys()]) stopWatch(id);
    for (const id of [...runPollTimers.keys()]) stopWatch(id);
  }

  /** @deprecated 兼容旧调用：停止全部订阅 */
  function stopPoll() {
    stopAllWatches();
  }

  function trackLiveRun(runId: string, focusNodeId?: string) {
    const focus = String(focusNodeId || '').trim();
    liveRunFocus.value = { ...liveRunFocus.value, [runId]: focus };
    if (focus) {
      liveNodeRuns.value = { ...liveNodeRuns.value, [focus]: runId };
    }
  }

  function untrackLiveRun(runId: string) {
    const nextFocus = { ...liveRunFocus.value };
    delete nextFocus[runId];
    liveRunFocus.value = nextFocus;
    const nextNodes: Record<string, string> = {};
    for (const [nid, rid] of Object.entries(liveNodeRuns.value)) {
      if (rid !== runId) nextNodes[nid] = rid;
    }
    liveNodeRuns.value = nextNodes;
  }

  function claimBusyNodesFromStates(
    runId: string,
    states: Record<string, any> | undefined,
  ) {
    if (!states) return;
    const next = { ...liveNodeRuns.value };
    let changed = false;
    for (const [nid, st] of Object.entries(states)) {
      if (pendingCancelNodeIds.has(nid)) continue;
      if (!hooks.isNodeBusyStatus(st?.status)) continue;
      if (next[nid] && next[nid] !== runId) continue;
      if (next[nid] !== runId) {
        next[nid] = runId;
        changed = true;
      }
    }
    if (changed) liveNodeRuns.value = next;
  }

  function startPoll(runId: string, focusNodeId?: string) {
    stopWatch(runId);
    trackLiveRun(runId, focusNodeId);
    const ac = new AbortController();
    runWatchAborts.set(runId, ac);

    const settle = (r: WorkflowRunRow) => {
      stopWatch(runId);
      untrackLiveRun(runId);
      if (!hooks.activeRun.value || hooks.activeRun.value.id === runId) {
        hooks.activeRun.value = r;
      }
      if (focusNodeId) hooks.finishNodeRun(focusNodeId, r);
      else {
        hooks.applyNodeStates(r.nodeStates as Record<string, unknown>, runId);
        if (r.status === 'completed') {
          hooks.toastCompleted(r.nodeStates as Record<string, unknown>);
        }
        if (r.status === 'failed' || r.status === 'cancelled') {
          hooks.notifyError(r.error || r.message);
        }
      }
    };

    void watchWorkflowRun(
      runId,
      (payload) => {
        const row = {
          ...(hooks.activeRun.value?.id === runId ? hooks.activeRun.value : { id: runId }),
          id: payload.id || runId,
          status: payload.status,
          nodeStates: payload.nodeStates,
          result: payload.result || {},
          error: payload.error || '',
          progress:
            payload.progress ??
            (hooks.activeRun.value?.id === runId ? hooks.activeRun.value.progress : 0) ??
            0,
          message:
            payload.message ??
            (hooks.activeRun.value?.id === runId ? hooks.activeRun.value.message : '') ??
            '',
        } as WorkflowRunRow;
        if (!hooks.activeRun.value || hooks.activeRun.value.id === runId) {
          hooks.activeRun.value = row;
        }
        claimBusyNodesFromStates(runId, payload.nodeStates);
        hooks.applyNodeStates(payload.nodeStates as Record<string, unknown>, runId);
        if (isTerminalRunStatus(payload.status)) settle(row);
      },
      ac.signal,
    ).catch(() => {
      if (ac.signal.aborted) return;
      const timer = setInterval(async () => {
        try {
          const r = await fetchWorkflowRun(runId);
          if (!hooks.activeRun.value || hooks.activeRun.value.id === runId) {
            hooks.activeRun.value = r;
          }
          claimBusyNodesFromStates(runId, r.nodeStates);
          hooks.applyNodeStates(r.nodeStates as Record<string, unknown>, runId);
          if (isTerminalRunStatus(r.status)) {
            stopWatch(runId);
            settle(r);
          }
        } catch {
          /* ignore poll errors */
        }
      }, 1500);
      runPollTimers.set(runId, timer);
    });
  }

  function resetLiveRuns() {
    stopAllWatches();
    liveRunFocus.value = {};
    liveNodeRuns.value = {};
    pendingCancelNodeIds.clear();
  }

  function isWatching(runId: string) {
    return runWatchAborts.has(runId) || runPollTimers.has(runId);
  }

  onBeforeUnmount(() => {
    stopAllWatches();
  });

  return {
    liveRunFocus,
    liveNodeRuns,
    pendingCancelNodeIds,
    liveRunCount,
    running,
    isTerminalRunStatus,
    stopWatch,
    stopAllWatches,
    stopPoll,
    trackLiveRun,
    untrackLiveRun,
    claimBusyNodesFromStates,
    startPoll,
    resetLiveRuns,
    isWatching,
  };
}
