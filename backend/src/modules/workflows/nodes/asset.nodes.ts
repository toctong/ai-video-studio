import type { AssetType } from '@ai-video-studio/shared';
import type { WorkflowNodeDefinition } from './types';
import { asText, port, workflowAssetMeta } from './types';

export const assetNodes: WorkflowNodeDefinition[] = [
  {
    type: 'asset.load',
    title: '加载素材',
    category: '资产',
    description: '按 assetId 加载 URL',
    inputs: [port('assetRef', '素材 ID', 'assetRef', true)],
    outputs: [
      port('assetRef', '素材', 'assetRef'),
      port('url', 'URL', 'text'),
      port('image', '图片', 'image'),
      port('video', '视频', 'video'),
      port('json', '元数据', 'json'),
    ],
    defaultParams: { assetId: '' },
    async execute(ctx) {
      const id = asText(ctx.inputs.assetRef || ctx.params.assetId).trim();
      if (!id) throw new Error('asset.load 需要 assetId');
      const asset = await ctx.services.assets.get(id);
      const url = ctx.services.assets.resolveMediaUrl(asset) || asset.url || '';
      const isImage = /image|storyboard|cover|scene|character/i.test(String(asset.type));
      return {
        assetRef: asset.id,
        url,
        image: isImage ? url : '',
        video: asset.type === 'video' ? url : '',
        json: {
          id: asset.id,
          type: asset.type,
          name: asset.name,
          url,
          prompt: asset.prompt,
          meta: asset.meta,
        },
      };
    },
  },
  {
    type: 'asset.save',
    title: '保存素材',
    category: '资产',
    description: '将文本/图片/视频 URL 写入资产库',
    inputs: [
      port('text', '文本', 'text', true),
      port('image', '图片', 'image', true),
      port('video', '视频', 'video', true),
    ],
    outputs: [port('assetRef', '素材', 'assetRef'), port('url', 'URL', 'text')],
    defaultParams: { type: 'storyboard', name: 'workflow-asset', prompt: '' },
    async execute(ctx) {
      if (!ctx.projectId) throw new Error('asset.save 需要 projectId');
      const type = (asText(ctx.params.type) || 'storyboard') as AssetType;
      const name = asText(ctx.params.name) || 'workflow-asset';
      const prompt = asText(ctx.params.prompt || ctx.inputs.text);
      const image = asText(ctx.inputs.image);
      const video = asText(ctx.inputs.video);
      const text = asText(ctx.inputs.text);
      if (image && type !== 'video') {
        const a = await ctx.services.assets.createFromUrl(ctx.projectId, {
          type: type || 'storyboard',
          name,
          url: image,
          prompt,
          meta: workflowAssetMeta(ctx, { node: 'asset.save' }),
        });
        return { assetRef: a.id, url: a.url };
      }
      if (video || type === 'video') {
        const a = await ctx.services.assets.createFromUrl(ctx.projectId, {
          type: 'video',
          name,
          url: video || image,
          prompt,
          meta: workflowAssetMeta(ctx, { node: 'asset.save' }),
        });
        return { assetRef: a.id, url: a.url };
      }
      if (text) {
        const a = await ctx.services.assets.createTextAsset(ctx.projectId, {
          type: type === 'script' ? 'script' : 'other',
          name,
          content: text,
          prompt,
          meta: workflowAssetMeta(ctx, { node: 'asset.save' }),
        });
        return { assetRef: a.id, url: a.url };
      }
      throw new Error('asset.save 缺少可保存内容');
    },
  },
  {
    type: 'asset.listByType',
    title: '列出素材',
    category: '资产',
    domains: ['novel'],
    description: '按类型列出项目素材',
    inputs: [],
    outputs: [port('json', '列表', 'json'), port('text', '摘要', 'text')],
    defaultParams: { type: 'storyboard' },
    async execute(ctx) {
      if (!ctx.projectId) throw new Error('asset.listByType 需要 projectId');
      const type = asText(ctx.params.type) as AssetType | '';
      const list = await ctx.services.assets.list(
        ctx.projectId,
        type ? (type as AssetType) : undefined,
      );
      const slim = list.slice(0, 50).map((a) => ({
        id: a.id,
        type: a.type,
        name: a.name,
        url: a.url,
      }));
      return {
        json: slim,
        text: slim.map((a) => `${a.type}:${a.name}`).join('\n'),
      };
    },
  },
];
