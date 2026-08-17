import type { WorkflowNodeDefinition } from './types';
import { asBool, asText, htmlToPlainText, port } from './types';

export const inputNodes: WorkflowNodeDefinition[] = [
  {
    type: 'input.text',
    title: '文本输入',
    category: '输入',
    /** 画布文本节点 + 书库/兼容旧图 */
    domains: ['studio', 'novel'],
    description: '画布文本节点；可连参考图；也可作为运行时 inputs 键',
    inputs: [
      port('text', '文本', 'text', true),
      port('image', '参考图', 'image', true),
    ],
    outputs: [port('text', '文本', 'text')],
    defaultParams: { value: '', inputKey: '', referenceImage: '' },
    paramSchema: [
      { key: 'value', label: '文本', type: 'textarea', placeholder: '输入提示词或文案…' },
      { key: 'inputKey', label: '运行时输入键', type: 'string', placeholder: '可选' },
      { key: 'referenceImage', label: '参考图 URL', type: 'image' },
    ],
    async execute(ctx) {
      const key = asText(ctx.params.inputKey).trim();
      const fromRun = key ? ctx.runInputs[key] : undefined;
      const fromPort = htmlToPlainText(ctx.inputs?.text ?? '');
      const own = htmlToPlainText(ctx.params.value ?? '');
      const text = htmlToPlainText(fromRun ?? (own || fromPort));
      const imageRaw = ctx.inputs?.image;
      const fromImages: string[] = [];
      const pushImg = (v: unknown) => {
        if (Array.isArray(v)) {
          for (const x of v) pushImg(x);
          return;
        }
        const s = asText(v).trim();
        if (s && !fromImages.includes(s)) fromImages.push(s);
      };
      pushImg(imageRaw);
      const paramRef = asText(ctx.params.referenceImage).trim();
      const referenceImage = fromImages[0] || paramRef;
      if (referenceImage && !paramRef) ctx.params.referenceImage = referenceImage;
      return { text, ...(referenceImage ? { referenceImage } : {}) };
    },
  },
  {
    type: 'input.note',
    title: '备注',
    category: '输入',
    description: '画布备注，仅展示，不参与连线',
    domains: ['studio'],
    inputs: [],
    outputs: [],
    defaultParams: { value: '' },
    paramSchema: [
      { key: 'value', label: '备注', type: 'textarea', placeholder: '写备注…' },
    ],
    async execute(ctx) {
      return { note: asText(ctx.params.value ?? '') };
    },
  },
  {
    type: 'input.image',
    title: '图片输入',
    category: '输入',
    description: '上传/粘贴图片；可连文本作为画面描述',
    inputs: [
      port('prompt', '文案', 'text', true),
      port('image', '图片', 'image'),
    ],
    outputs: [port('image', '图片', 'image')],
    defaultParams: { url: '', assetId: '', inputKey: '', prompt: '' },
    async execute(ctx) {
      const key = asText(ctx.params.inputKey).trim();
      const fromRun = key ? ctx.runInputs[key] : undefined;
      const fromPort = asText(ctx.inputs?.image ?? '');
      const fromText = asText(ctx.inputs?.prompt ?? '');
      const assetId = asText(ctx.params.assetId).trim();
      // 上游文案写入 params，便于弹层展示 / 下游生图复用
      if (fromText.trim() && !asText(ctx.params.prompt).trim()) {
        ctx.params.prompt = fromText.trim();
      }
      if (assetId) {
        const asset = await ctx.services.assets.get(assetId);
        return { image: asset.url || fromPort || '', assetRef: asset.id };
      }
      const image = asText(fromPort || fromRun || ctx.params.url || '').trim();
      if (!image) {
        const prompt = asText(ctx.params.prompt || fromText).trim();
        throw new Error(
          prompt
            ? '「图片输入」不会调用 AI 生图。请改用画布「图片 / AI 生图」节点后再运行'
            : '图片输入节点没有图片，请先上传或从素材库选择',
        );
      }
      return { image };
    },
  },
  {
    type: 'input.video',
    title: '视频输入',
    category: '输入',
    description: '上传/粘贴视频，输出给下游预览或再处理',
    inputs: [],
    outputs: [port('video', '视频', 'video')],
    defaultParams: { url: '', assetId: '', inputKey: '' },
    async execute(ctx) {
      const key = asText(ctx.params.inputKey).trim();
      const fromRun = key ? ctx.runInputs[key] : undefined;
      const assetId = asText(ctx.params.assetId).trim();
      if (assetId) {
        const asset = await ctx.services.assets.get(assetId);
        return { video: asset.url || '', assetRef: asset.id };
      }
      return {
        video: asText(fromRun ?? ctx.params.url ?? ''),
      };
    },
  },
  {
    type: 'input.choice',
    title: '选项输入',
    category: '输入',
    description: '布尔/选项，供下游分支参数使用',
    inputs: [],
    outputs: [port('text', '文本', 'text')],
    defaultParams: { value: true, inputKey: '', labelTrue: '是', labelFalse: '否' },
    async execute(ctx) {
      const key = asText(ctx.params.inputKey).trim();
      const fromRun = key ? ctx.runInputs[key] : undefined;
      const value = asBool(fromRun ?? ctx.params.value, true);
      return {
        value,
        text: value ? asText(ctx.params.labelTrue) || '是' : asText(ctx.params.labelFalse) || '否',
      };
    },
  },
];
