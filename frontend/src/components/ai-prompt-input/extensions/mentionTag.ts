import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import MentionTagView from '../MentionTag.vue';

export type MentionTagAttrs = {
  label: string;
  mentionId: string;
  expandText: string;
  url: string;
  mediaKind: '' | 'image' | 'video' | 'text';
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mentionTag: {
      insertMentionTag: (attrs: Partial<MentionTagAttrs>) => ReturnType;
    };
  }
}

export const MentionTag = Node.create({
  name: 'mentionTag',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      label: { default: '@参考' },
      mentionId: { default: '' },
      expandText: { default: '' },
      url: { default: '' },
      mediaKind: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-mention-tag]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-mention-tag': '' }, HTMLAttributes)];
  },

  addNodeView() {
    return VueNodeViewRenderer(MentionTagView);
  },

  addCommands() {
    return {
      insertMentionTag:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              label: attrs.label || '@参考',
              mentionId: attrs.mentionId || '',
              expandText: attrs.expandText || '',
              url: attrs.url || '',
              mediaKind: attrs.mediaKind || '',
            },
          }),
    };
  },
});
