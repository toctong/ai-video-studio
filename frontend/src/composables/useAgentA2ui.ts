import { onMounted, onUnmounted, ref, type Ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useMessageProcessor } from 'a2ui-vue';
import { A2UI_BASIC_CATALOG_ID } from '@/a2ui/theme';

const CATALOG_ID = A2UI_BASIC_CATALOG_ID;

export type AgentA2uiActionPayload = {
  name: string;
  context: Record<string, unknown>;
  dataModel: Record<string, unknown>;
  surfaceId: string;
};

/**
 * Agent 弹层用的轻量 A2UI host：ingest 消息、surfaceId remap、订阅按钮 action。
 */
export function useAgentA2ui(opts?: {
  onAction?: (payload: AgentA2uiActionPayload) => void | Promise<void>;
}) {
  const processor = useMessageProcessor();
  const activeSurfaceId = ref('');
  const surfaceIds: Ref<string[]> = ref([]);
  let turnSeq = 0;
  let unsub: (() => void) | undefined;

  function remapSurfaceMessages(messages: Record<string, unknown>[], surfaceId: string) {
    return messages
      .filter((m) => !m.deleteSurface)
      .map((raw) => {
        const m = JSON.parse(JSON.stringify(raw)) as Record<string, any>;
        for (const key of ['createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface']) {
          if (m[key]?.surfaceId) m[key].surfaceId = surfaceId;
        }
        return m;
      });
  }

  /** 英文默认占位 → 中文；旧会话/AI 漏传时兜底 */
  function localizeFormPlaceholders(messages: Record<string, unknown>[]) {
    return messages.map((raw) => {
      const m = JSON.parse(JSON.stringify(raw)) as Record<string, any>;
      const comps = m.updateComponents?.components;
      if (!Array.isArray(comps)) return m;
      for (const c of comps) {
        if (String(c?.component || '') !== 'TextField') continue;
        const ph = String(c.placeholder || '').trim();
        const bad =
          !ph ||
          /please enter a value/i.test(ph) ||
          /^enter (a )?value$/i.test(ph) ||
          /^type here$/i.test(ph);
        if (!bad) continue;
        const long = String(c.variant || '').toLowerCase().includes('long');
        c.placeholder = long ? '选填，可补充额外要求…' : '请输入';
      }
      return m;
    });
  }

  function ingestA2ui(messages: Record<string, unknown>[]) {
    const surfaceId = `agent-${++turnSeq}`;
    const remapped = localizeFormPlaceholders(remapSurfaceMessages(messages, surfaceId));
    if (!remapped.length) return '';
    const hasCreate = remapped.some((m) => m.createSurface);
    const batch = hasCreate
      ? remapped
      : [
          {
            version: 'v0.9',
            createSurface: { surfaceId, catalogId: CATALOG_ID, sendDataModel: true },
          },
          ...remapped,
        ];
    processor.processMessages(batch as any);
    activeSurfaceId.value = surfaceId;
    if (!surfaceIds.value.includes(surfaceId)) {
      surfaceIds.value = [...surfaceIds.value, surfaceId];
    }
    return surfaceId;
  }

  function patchA2ui(messages: Record<string, unknown>[]) {
    const surfaceId = activeSurfaceId.value;
    if (!surfaceId) {
      return ingestA2ui(messages);
    }
    const remapped = localizeFormPlaceholders(
      remapSurfaceMessages(messages, surfaceId).filter((m) => !m.createSurface && !m.deleteSurface),
    );
    if (!remapped.length) return surfaceId;
    processor.processMessages(remapped as any);
    return surfaceId;
  }

  function clearSurfaces() {
    processor.clearSurfaces();
    activeSurfaceId.value = '';
    surfaceIds.value = [];
    turnSeq = 0;
  }

  function bindEvents() {
    unsub?.();
    unsub = processor.onEvent(({ message, resolve, reject }) => {
      const name = message?.action?.name;
      const context = (message?.action?.context || {}) as Record<string, unknown>;
      const surfaceId = String(message?.action?.surfaceId || activeSurfaceId.value);
      const surface = processor.getSurface(surfaceId);
      const rootModel =
        (surface?.dataModel?.get?.('/') as Record<string, unknown> | undefined) || {};

      const isPathRef = (v: unknown) =>
        !!v && typeof v === 'object' && !Array.isArray(v) && 'path' in (v as object);

      const readPath = (path: string) => {
        if (surface?.dataModel?.get) {
          try {
            return surface.dataModel.get(path);
          } catch {
            /* ignore */
          }
        }
        const bare = path.replace(/^\//, '');
        return bare ? rootModel[bare] : undefined;
      };

      const resolvedContext: Record<string, unknown> = {};
      const dataModel: Record<string, unknown> = { ...rootModel };
      for (const [k, v] of Object.entries(context)) {
        if (isPathRef(v)) {
          const resolved = readPath(String((v as { path: string }).path || ''));
          if (resolved !== undefined) {
            resolvedContext[k] = resolved;
            dataModel[k] = resolved;
          } else {
            resolvedContext[k] = rootModel[k];
          }
        } else {
          resolvedContext[k] = v;
          dataModel[k] = v;
        }
      }

      const run = Promise.resolve(
        opts?.onAction?.({
          name: String(name || ''),
          context: resolvedContext,
          dataModel,
          surfaceId,
        }),
      );
      run
        .then(() => resolve([]))
        .catch((err) => {
          ElMessage.error(err?.message || '操作失败');
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    });
  }

  onMounted(() => bindEvents());
  onUnmounted(() => {
    unsub?.();
    clearSurfaces();
  });

  return {
    processor,
    activeSurfaceId,
    surfaceIds,
    ingestA2ui,
    patchA2ui,
    clearSurfaces,
    bindEvents,
  };
}
