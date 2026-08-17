declare module '@wangeditor/editor-for-vue' {
  import type { DefineComponent } from 'vue';

  /** wangEditor 的 Vue3 封装组件（包自身未暴露可用的类型入口） */
  export const Editor: DefineComponent<Record<string, unknown>>;
  export const Toolbar: DefineComponent<Record<string, unknown>>;
}
