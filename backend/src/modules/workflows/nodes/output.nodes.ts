import type { WorkflowNodeDefinition } from './types';
import { asText, port } from './types';

export const outputNodes: WorkflowNodeDefinition[] = [
  {
    type: 'output.preview',
    title: '结果预览',
    category: '输出',
    description: '工作流终点：接入最终图片或视频（文本可写在参数里）',
    inputs: [
      port('prompt', '文案', 'text', true),
      port('image', '图片', 'image', true),
      port('video', '视频', 'video', true),
    ],
    outputs: [],
    defaultParams: { text: '' },
    async execute(ctx) {
      const text = asText(ctx.inputs.prompt || ctx.params.text || ctx.inputs.text);
      const image = asText(ctx.inputs.image);
      const video = asText(ctx.inputs.video);
      const summary = { text, image, video };
      return { text, image, video, json: summary, summary };
    },
  },
];
