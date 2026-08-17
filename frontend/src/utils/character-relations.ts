import {
  displayStoryRole,
  roleOfCharacter,
  roleTierOfCharacter,
  type RoleTier,
} from '@/utils/story-roles';

export type CharGraphNode = {
  id: string;
  name: string;
  tier: RoleTier;
  roleLabel: string;
  campLabel: string;
  occupation: string;
  description: string;
  x: number;
  y: number;
  /** 碰撞/连线用半径 */
  r: number;
  w: number;
  h: number;
};

export type CharGraphEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  kind: 'ally' | 'rival' | 'mention' | 'link';
};

function campOf(row: any, leadId?: string): string {
  const explicit = String(row?.meta?.camp || '').trim();
  if (explicit) return explicit;
  const tier = roleTierOfCharacter(row, leadId);
  if (tier === 'antagonist') return '反派';
  if (tier === 'lead' || tier === 'party') return '正派';
  return '中立';
}

function occupationOf(row: any): string {
  const m = row?.meta || {};
  const occ = String(m.occupation || '').trim();
  if (occ) return occ;
  const role = roleOfCharacter(row);
  if (
    role &&
    !['主角', '主角团', '重要配角', '功能配角', '对手/反派', '女主角', '男主角'].includes(role)
  ) {
    return role;
  }
  return '';
}

function placeOnArc(
  count: number,
  index: number,
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  endDeg: number,
) {
  if (count <= 0) return { x: cx, y: cy };
  const t = count === 1 ? 0.5 : index / Math.max(1, count - 1);
  const deg = startDeg + (endDeg - startDeg) * t;
  const rad = (deg * Math.PI) / 180;
  return {
    x: cx + Math.cos(rad) * radius,
    y: cy + Math.sin(rad) * radius,
  };
}

function nodeSize(tier: RoleTier, name: string) {
  const len = Math.min(String(name || '').length, 6);
  if (tier === 'lead') return { w: 108 + len * 3, h: 48, r: 40 };
  if (tier === 'party' || tier === 'antagonist') return { w: 96 + len * 2.5, h: 44, r: 34 };
  return { w: 88 + len * 2, h: 40, r: 30 };
}

/** 根据站位 + 简介互提姓名，生成关系图节点与边 */
export function buildCharacterGraph(
  rows: any[],
  opts?: { leadId?: string; width?: number; height?: number },
) {
  const width = opts?.width || 920;
  const height = opts?.height || 560;
  const leadId = opts?.leadId || '';
  const cx = width / 2;
  const cy = height / 2 + 8;
  const scale = Math.min(width / 920, height / 560);

  const buckets: Record<RoleTier, any[]> = {
    lead: [],
    party: [],
    support: [],
    antagonist: [],
  };
  for (const row of rows) {
    buckets[roleTierOfCharacter(row, leadId)].push(row);
  }

  const nodes: CharGraphNode[] = [];
  const byId = new Map<string, CharGraphNode>();

  const pushNode = (row: any, x: number, y: number) => {
    const tier = roleTierOfCharacter(row, leadId);
    const name = String(row.name || '未命名');
    const size = nodeSize(tier, name);
    const node: CharGraphNode = {
      id: String(row.id),
      name,
      tier,
      roleLabel: displayStoryRole(row, leadId),
      campLabel: campOf(row, leadId),
      occupation: occupationOf(row),
      description: String(row.description || ''),
      x,
      y,
      r: size.r,
      w: size.w,
      h: size.h,
    };
    nodes.push(node);
    byId.set(node.id, node);
  };

  const leads = buckets.lead;
  leads.forEach((row, i) => {
    const offset = leads.length === 1 ? 0 : (i - (leads.length - 1) / 2) * 110 * scale;
    pushNode(row, cx + offset, cy);
  });

  // 同伴：左侧扇区
  buckets.party.forEach((row, i) => {
    const p = placeOnArc(buckets.party.length, i, cx, cy, 210 * scale, 150, 225);
    pushNode(row, p.x, p.y);
  });

  // 配角：上弧，略疏
  buckets.support.forEach((row, i) => {
    const p = placeOnArc(buckets.support.length, i, cx, cy, 265 * scale, 240, 300);
    pushNode(row, p.x, p.y);
  });

  // 对立：右侧扇区
  buckets.antagonist.forEach((row, i) => {
    const p = placeOnArc(buckets.antagonist.length, i, cx, cy, 220 * scale, -55, 55);
    pushNode(row, p.x, p.y);
  });

  const edges: CharGraphEdge[] = [];
  const pairKinds = new Map<string, CharGraphEdge['kind']>();
  const addEdge = (from: string, to: string, label: string, kind: CharGraphEdge['kind']) => {
    if (!from || !to || from === to) return;
    if (!byId.has(from) || !byId.has(to)) return;
    const a = from < to ? from : to;
    const b = from < to ? to : from;
    const pair = `${a}|${b}`;
    const rank = { rival: 4, ally: 3, link: 2, mention: 1 } as const;
    const prev = pairKinds.get(pair);
    if (prev && rank[prev] >= rank[kind]) return;
    // 替换弱边
    if (prev) {
      const idx = edges.findIndex((e) => e.id.startsWith(pair));
      if (idx >= 0) edges.splice(idx, 1);
    }
    pairKinds.set(pair, kind);
    edges.push({ id: `${pair}|${label}`, from, to, label, kind });
  };

  const primaryLead = leads[0] ? String(leads[0].id) : '';

  for (const row of buckets.party) {
    if (primaryLead) addEdge(String(row.id), primaryLead, '同伴', 'ally');
  }
  for (const row of buckets.antagonist) {
    if (primaryLead) addEdge(String(row.id), primaryLead, '对立', 'rival');
  }
  // 配角只连前 4 个，避免蜘蛛网
  for (const row of buckets.support.slice(0, 4)) {
    if (primaryLead) addEdge(String(row.id), primaryLead, '关联', 'link');
  }

  for (const a of rows) {
    const text = String(a.description || '');
    if (!text) continue;
    for (const b of rows) {
      if (a.id === b.id) continue;
      const name = String(b.name || '').trim();
      if (name.length < 2) continue;
      if (text.includes(name)) addEdge(String(a.id), String(b.id), '提及', 'mention');
    }
  }

  for (const row of rows) {
    const rels = (row?.meta as any)?.relations;
    if (!Array.isArray(rels)) continue;
    for (const rel of rels) {
      const tid = String(rel?.targetId || rel?.to || '').trim();
      const label = String(rel?.label || '关系').trim() || '关系';
      if (!tid) continue;
      const kind: CharGraphEdge['kind'] = /对立|仇|敌|反/.test(label)
        ? 'rival'
        : /同伴|友|搭档|恋人|师/.test(label)
          ? 'ally'
          : 'link';
      addEdge(String(row.id), tid, label, kind);
    }
  }

  return {
    nodes,
    edges,
    width,
    height,
    cx,
    cy,
    zones: {
      party: buckets.party.length > 0,
      support: buckets.support.length > 0,
      antagonist: buckets.antagonist.length > 0,
    },
  };
}

/** 连线端点缩进，避免穿进节点卡片 */
export function edgeEndpoints(
  from: CharGraphNode,
  to: CharGraphNode,
): { x1: number; y1: number; x2: number; y2: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  // 按胶囊半宽估算缩进，连线停在圆角边缘外
  const padA = from.w * 0.48;
  const padB = to.w * 0.48;
  return {
    x1: from.x + ux * padA,
    y1: from.y + uy * padA,
    x2: to.x - ux * padB,
    y2: to.y - uy * padB,
  };
}
