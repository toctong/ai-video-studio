import { computed, ref } from 'vue';
import { Message, Modal } from '@arco-design/web-vue';

export function useTableBatch() {
  const selectedKeys = ref<(string | number)[]>([]);
  const batchLoading = ref(false);

  const rowSelection = {
    type: 'checkbox' as const,
    showCheckedAll: true,
    onlyCurrent: false,
  };

  const hasSelection = computed(() => selectedKeys.value.length > 0);
  const selectionCount = computed(() => selectedKeys.value.length);

  function clearSelection() {
    selectedKeys.value = [];
  }

  async function runBatchAction(opts: {
    title: string;
    content: string;
    action: (ids: string[]) => Promise<void>;
    onDone?: () => void | Promise<void>;
  }) {
    const ids = selectedKeys.value.map(String);
    if (!ids.length) return;
    return new Promise<void>((resolve) => {
      Modal.confirm({
        title: opts.title,
        content: opts.content,
        onOk: async () => {
          batchLoading.value = true;
          try {
            await opts.action(ids);
            clearSelection();
            await opts.onDone?.();
          } finally {
            batchLoading.value = false;
          }
          resolve();
        },
        onCancel: () => resolve(),
      });
    });
  }

  async function batchDelete(
    deleteOne: (id: string) => Promise<unknown>,
    label = '项',
    onDone?: () => void | Promise<void>,
  ) {
    await runBatchAction({
      title: '批量删除',
      content: `确认删除选中的 ${selectedKeys.value.length} ${label}？此操作不可恢复。`,
      action: async (ids) => {
        const results = await Promise.allSettled(ids.map((id) => deleteOne(id)));
        const ok = results.filter((r) => r.status === 'fulfilled').length;
        const fail = results.length - ok;
        if (fail === 0) Message.success(`已删除 ${ok} 项`);
        else Message.warning(`成功 ${ok} 项，失败 ${fail} 项`);
      },
      onDone,
    });
  }

  return {
    selectedKeys,
    rowSelection,
    hasSelection,
    selectionCount,
    batchLoading,
    clearSelection,
    runBatchAction,
    batchDelete,
  };
}
