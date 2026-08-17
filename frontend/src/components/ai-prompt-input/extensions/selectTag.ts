import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import SelectTagView from '../SelectTag.vue';
import type { SelectTagOption } from '../types';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    selectTag: {
      insertSelectTag: (attrs: {
        value: string;
        options: SelectTagOption[];
      }) => ReturnType;
    };
  }
}

export const SelectTag = Node.create({
  name: 'selectTag',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      value: { default: '' },
      options: {
        default: [] as SelectTagOption[],
        parseHTML: (el) => {
          try {
            const raw = el.getAttribute('data-options');
            return raw ? JSON.parse(raw) : [];
          } catch {
            return [];
          }
        },
        renderHTML: (attrs) => ({
          'data-options': JSON.stringify(attrs.options || []),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-select-tag]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-select-tag': '' }, HTMLAttributes)];
  },

  addNodeView() {
    return VueNodeViewRenderer(SelectTagView);
  },

  addCommands() {
    return {
      insertSelectTag:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              value: attrs.value || attrs.options?.[0]?.value || '',
              options: attrs.options || [],
            },
          }),
    };
  },
});
