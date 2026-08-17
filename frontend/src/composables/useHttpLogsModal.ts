import { ref } from 'vue';

const open = ref(false);

/** 接口日志弹层（全局单例，顶栏打开） */
export function useHttpLogsModal() {
  return {
    open,
    show() {
      open.value = true;
    },
    hide() {
      open.value = false;
    },
    toggle() {
      open.value = !open.value;
    },
  };
}
