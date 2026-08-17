import { onBeforeUnmount, type Ref } from 'vue';

export type CanvasAutosaveOptions = {
  dirty: Ref<boolean>;
  bootLoading: Ref<boolean>;
  suppressDirty: Ref<boolean>;
  /** 返回 true 表示当前不应自动保存（如脚本生成中） */
  isBlocked?: () => boolean;
  save: () => void | Promise<unknown>;
  delayMs?: number;
};

/**
 * 画布脏标记 + 防抖自动保存。
 * StudioCanvasView 把 markDirty 挂到节点/边变更上即可。
 */
export function useCanvasAutosave(opts: CanvasAutosaveOptions) {
  const delay = Math.max(200, Number(opts.delayMs) || 900);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleAutoSave() {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      if (
        opts.dirty.value &&
        !opts.bootLoading.value &&
        !opts.suppressDirty.value &&
        !opts.isBlocked?.()
      ) {
        void opts.save();
      }
    }, delay);
  }

  function markDirty() {
    if (opts.suppressDirty.value || opts.bootLoading.value) return;
    opts.dirty.value = true;
    scheduleAutoSave();
  }

  onBeforeUnmount(clearTimer);

  return { markDirty, scheduleAutoSave, clearAutoSaveTimer: clearTimer };
}
