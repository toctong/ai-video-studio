import type { WorkflowNodeDefinition } from './types';
import { asNumber, asText, port } from './types';

export const libraryNodes: WorkflowNodeDefinition[] = [
  {
    type: 'library.shotExpand',
    title: '镜头库细案',
    category: '镜头库',
    domains: ['studio', 'novel'],
    description: '镜头概念 → 成片/定妆/场景细案 JSON',
    inputs: [port('shotId', '镜头 ID', 'text', true)],
    outputs: [
      port('json', '细案', 'json'),
      port('text', '成片提示', 'text'),
      port('imagePrompt', '场景提示', 'text'),
    ],
    defaultParams: { shotId: '', model: '', durationSec: 10 },
    async execute(ctx) {
      const shotId = asText(ctx.inputs.shotId || ctx.params.shotId || ctx.runInputs.shotId).trim();
      if (!shotId) throw new Error('library.shotExpand 需要 shotId');
      await ctx.progress(`扩写镜头细案 ${shotId}…`);
      const result = await ctx.services.libraries.expandShotPrompt(shotId, {
        model: asText(ctx.params.model) || undefined,
        durationSec: asNumber(ctx.params.durationSec, 0) || undefined,
      });
      const videoPrompt = asText((result as any)?.videoPrompt);
      const imagePrompt = asText((result as any)?.scene?.imagePrompt || (result as any)?.scenePrompt);
      return { json: result, text: videoPrompt, imagePrompt };
    },
  },
  {
    type: 'library.renderPortrait',
    title: '镜头定妆出图',
    category: '镜头库',
    /** 短剧画布主路径用编译子图 + ai.image；此节点仅书库域暴露 */
    domains: ['novel'],
    description: '细案人物定妆图',
    inputs: [
      port('shotId', '镜头 ID', 'text', true),
      port('portraitPrompt', '定妆提示', 'text', true),
    ],
    outputs: [port('image', '定妆图', 'image'), port('json', '结果', 'json')],
    defaultParams: { shotId: '', characterIndex: 0, model: '' },
    async execute(ctx) {
      const shotId = asText(ctx.inputs.shotId || ctx.params.shotId || ctx.runInputs.shotId).trim();
      if (!shotId) throw new Error('library.renderPortrait 需要 shotId');
      await ctx.progress('生成定妆图…');
      const result = await ctx.services.libraries.renderShotPortrait(shotId, {
        characterIndex: asNumber(ctx.params.characterIndex, 0),
        model: asText(ctx.params.model) || undefined,
        portraitPrompt: asText(ctx.inputs.portraitPrompt || ctx.params.portraitPrompt) || undefined,
      });
      const image = asText((result as any)?.url || (result as any)?.portraitUrl);
      return { image, json: result };
    },
  },
  {
    type: 'library.renderScene',
    title: '镜头场景出图',
    category: '镜头库',
    domains: ['novel'],
    description: '细案场景空镜',
    inputs: [
      port('shotId', '镜头 ID', 'text', true),
      port('imagePrompt', '场景提示', 'text', true),
    ],
    outputs: [port('image', '场景图', 'image'), port('json', '结果', 'json')],
    defaultParams: { shotId: '', model: '' },
    async execute(ctx) {
      const shotId = asText(ctx.inputs.shotId || ctx.params.shotId || ctx.runInputs.shotId).trim();
      if (!shotId) throw new Error('library.renderScene 需要 shotId');
      await ctx.progress('生成场景图…');
      const result = await ctx.services.libraries.renderShotScene(shotId, {
        model: asText(ctx.params.model) || undefined,
        imagePrompt: asText(ctx.inputs.imagePrompt || ctx.params.imagePrompt) || undefined,
      });
      const image = asText((result as any)?.url || (result as any)?.sceneUrl);
      return { image, json: result };
    },
  },
  {
    type: 'library.renderProp',
    title: '镜头道具出图',
    category: '镜头库',
    domains: ['novel'],
    description: '细案道具静物',
    inputs: [
      port('shotId', '镜头 ID', 'text', true),
      port('propPrompt', '道具提示', 'text', true),
    ],
    outputs: [port('image', '道具图', 'image'), port('json', '结果', 'json')],
    defaultParams: { shotId: '', propIndex: 0, model: '' },
    async execute(ctx) {
      const shotId = asText(ctx.inputs.shotId || ctx.params.shotId || ctx.runInputs.shotId).trim();
      if (!shotId) throw new Error('library.renderProp 需要 shotId');
      await ctx.progress('生成道具图…');
      const result = await ctx.services.libraries.renderShotProp(shotId, {
        propIndex: asNumber(ctx.params.propIndex, 0),
        model: asText(ctx.params.model) || undefined,
        propPrompt: asText(ctx.inputs.propPrompt || ctx.params.propPrompt) || undefined,
      });
      const image = asText((result as any)?.url || (result as any)?.propUrl);
      return { image, json: result };
    },
  },
  {
    type: 'library.renderCharacterSheet',
    title: '镜头设定板出图',
    category: '镜头库',
    domains: ['novel'],
    description: '工业角色设定板（16:9 五区）',
    inputs: [
      port('shotId', '镜头 ID', 'text', true),
      port('sheetPrompt', '设定板提示', 'text', true),
    ],
    outputs: [port('image', '设定板', 'image'), port('json', '结果', 'json')],
    defaultParams: { shotId: '', characterIndex: 0, model: '' },
    async execute(ctx) {
      const shotId = asText(ctx.inputs.shotId || ctx.params.shotId || ctx.runInputs.shotId).trim();
      if (!shotId) throw new Error('library.renderCharacterSheet 需要 shotId');
      await ctx.progress('生成角色设定板…');
      const result = await ctx.services.libraries.renderShotCharacterSheet(shotId, {
        characterIndex: asNumber(ctx.params.characterIndex, 0),
        model: asText(ctx.params.model) || undefined,
        sheetPrompt: asText(ctx.inputs.sheetPrompt || ctx.params.sheetPrompt) || undefined,
      });
      const image = asText((result as any)?.url);
      return { image, json: result };
    },
  },
  {
    type: 'library.renderPlotGrid',
    title: '镜头剧情宫格出图',
    category: '镜头库',
    domains: ['novel'],
    description: '9 宫格剧情板（审阅用）',
    inputs: [
      port('shotId', '镜头 ID', 'text', true),
      port('plotGridPrompt', '宫格提示', 'text', true),
    ],
    outputs: [port('image', '宫格图', 'image'), port('json', '结果', 'json')],
    defaultParams: { shotId: '', model: '' },
    async execute(ctx) {
      const shotId = asText(ctx.inputs.shotId || ctx.params.shotId || ctx.runInputs.shotId).trim();
      if (!shotId) throw new Error('library.renderPlotGrid 需要 shotId');
      await ctx.progress('生成剧情宫格…');
      const result = await ctx.services.libraries.renderShotPlotGrid(shotId, {
        model: asText(ctx.params.model) || undefined,
        plotGridPrompt:
          asText(ctx.inputs.plotGridPrompt || ctx.params.plotGridPrompt) || undefined,
      });
      const image = asText((result as any)?.url);
      return { image, json: result };
    },
  },
];
