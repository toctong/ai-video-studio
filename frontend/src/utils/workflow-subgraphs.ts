import type { WorkflowEdge, WorkflowGroup, WorkflowNode } from '@ai-video-studio/shared';
import { prependStyleLock } from '@/utils/style-lock';

let _seq = 0;
function nid(prefix: string) {
  _seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${_seq}`;
}

export type CharacterModuleResult = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  groups: WorkflowGroup[];
  portraitImageId: string;
  sheetImageId: string;
  /** 模块占用后的下一行 y（分组底边 + gap） */
  nextY: number;
};

export type SceneModuleResult = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  groups: WorkflowGroup[];
  sceneImageId: string;
  nextY: number;
};

/**
 * 角色子图模块（可复用）：竖版定妆 + 工业设定板。
 * 提示词写在 ai.image.params.prompt，无独立文本节点。
 */
export function buildCharacterModule(opts: {
  name: string;
  portraitPrompt: string;
  sheetPrompt?: string;
  appearance?: string;
  role?: string;
  styleLock?: string;
  styleTag?: string;
  originX: number;
  originY: number;
  gapY?: number;
}): CharacterModuleResult {
  const name = String(opts.name || '角色').trim() || '角色';
  const gapY = opts.gapY ?? 48;
  const padX = 52;
  const padTop = 56;
  const portraitRowH = 360;
  const sheetRowH = 340;

  const portraitPrompt = prependStyleLock(opts.portraitPrompt, opts.styleLock || '');
  const sheetRaw =
    String(opts.sheetPrompt || '').trim() ||
    [
      '【整体参数】横版16:9工业角色设定板；五区模块；干净浅灰底',
      `【风格气质】${opts.styleTag || '国漫'}；日常写实/国漫插画；禁止真人`,
      `【主体】${name}（${opts.role || '角色'}）；${opts.appearance || portraitPrompt.slice(0, 200)}`,
      '【布局】左上大头档案 + THREE VIEW + EXPRESSION + COSTUME 细节 + 短说明',
    ].join('\n');
  const sheetPrompt = prependStyleLock(sheetRaw, opts.styleLock || '');

  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  const groups: WorkflowGroup[] = [];

  let cursorY = opts.originY;
  let portraitImageId = '';
  let sheetImageId = '';

  {
    const gy = cursorY;
    const iy = gy + padTop;
    const imgId = nid('n');
    portraitImageId = imgId;
    nodes.push({
      id: imgId,
      type: 'ai.image',
      label: `竖版定妆·${name}`,
      position: { x: opts.originX + padX, y: iy },
      params: {
        name: `竖版定妆·${name}`,
        prompt: portraitPrompt,
        referenceImage: '',
        assetType: 'other',
        aspect: '9:16',
        size: '1440x2560',
      },
      mode: 'active',
    });
    groups.push({
      id: nid('g'),
      title: `模块·定妆 · ${name}`,
      x: opts.originX,
      y: gy,
      width: 520,
      height: 340,
      color: '#0d9488',
    });
    cursorY += portraitRowH + gapY;
  }

  {
    const gy = cursorY;
    const iy = gy + padTop;
    const imgId = nid('n');
    sheetImageId = imgId;
    nodes.push({
      id: imgId,
      type: 'ai.image',
      label: `角色设定板·${name}`,
      position: { x: opts.originX + padX, y: iy },
      params: {
        name: `角色设定板·${name}`,
        prompt: sheetPrompt,
        referenceImage: '',
        assetType: 'character_ref',
        aspect: '16:9',
        size: '2560x1440',
      },
      mode: 'active',
    });
    if (portraitImageId) {
      edges.push({
        id: nid('e'),
        source: portraitImageId,
        sourceHandle: 'image',
        target: imgId,
        targetHandle: 'image',
      });
    }
    groups.push({
      id: nid('g'),
      title: `③b 角色设定板 · ${name}`,
      x: opts.originX,
      y: gy,
      width: 520,
      height: 320,
      color: '#3b82f6',
    });
    cursorY += sheetRowH + gapY;
  }

  return {
    nodes,
    edges,
    groups,
    portraitImageId,
    sheetImageId,
    nextY: cursorY,
  };
}

/** 场景子图模块：场景提示写在生图节点 */
export function buildSceneModule(opts: {
  name: string;
  imagePrompt: string;
  styleLock?: string;
  originX: number;
  originY: number;
  gapY?: number;
}): SceneModuleResult {
  const name = String(opts.name || '场景').trim() || '场景';
  const gapY = opts.gapY ?? 48;
  const padX = 52;
  const padTop = 56;
  const sceneRowH = 300;
  const prompt = prependStyleLock(opts.imagePrompt, opts.styleLock || '');

  const gy = opts.originY;
  const iy = gy + padTop;
  const imgId = nid('n');

  return {
    nodes: [
      {
        id: imgId,
        type: 'ai.image',
        label: `场景·${name}`,
        position: { x: opts.originX + padX, y: iy },
        params: {
          name: `场景·${name}`,
          prompt,
          referenceImage: '',
          assetType: 'scene',
          aspect: '16:9',
          size: '2560x1440',
        },
        mode: 'active',
      },
    ],
    edges: [],
    groups: [
      {
        id: nid('g'),
        title: `④ 场景 · ${name}`,
        x: opts.originX,
        y: gy,
        width: 520,
        height: 280,
        color: '#2563eb',
      },
    ],
    sceneImageId: imgId,
    nextY: gy + sceneRowH + gapY,
  };
}
