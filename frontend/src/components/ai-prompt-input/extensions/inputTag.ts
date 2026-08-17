import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import InputTagView from '../InputTag.vue';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inputTag: {
      insertInputTag: (attrs: { label: string; text?: string }) => ReturnType;
    };
  }
}

export const InputTag = Node.create({
  name: 'inputTag',
  group: 'inline',
  inline: true,
  content: 'text*',
  atom: false,
  defining: false,

  addAttributes() {
    return {
      label: { default: '[填写]' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-input-tag]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-input-tag': '' }, HTMLAttributes), 0];
  },

  addNodeView() {
    return VueNodeViewRenderer(InputTagView);
  },

  addCommands() {
    return {
      insertInputTag:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { label: attrs.label || '[填写]' },
            content: attrs.text ? [{ type: 'text', text: attrs.text }] : [],
          }),
    };
  },
});
