import { findChatSkill, listChatSkills } from '@/utils/skill-catalog';

/** 对话可调用的系统动作（模型通过 ```action 声明，前端执行） */
export type ChatActionName =
  | 'run_skill'
  | 'to_canvas'
  | 'run_node'
  | 'add_node'
  | 'select_node'
  | 'set_param';

export type ChatAction = {
  name: ChatActionName;
  args?: Record<string, unknown>;
  /** 展示用 */
  label?: string;
};

export type ChatActionDef = {
  name: ChatActionName;
  label: string;
  desc: string;
  /** 写入 system，告诉模型何时调用 */
  when: string;
};

export const CHAT_ACTION_DEFS: ChatActionDef[] = [
  {
    name: 'run_skill',
    label: '调用技能',
    desc: '运行内置创作技能',
    when: '用户意图匹配某技能（写角色/剧情/钩子/出图提示等）时调用；args.skillId 必填',
  },
  {
    name: 'to_canvas',
    label: '落到当前画布',
    desc: '把回复里的 ```image / 提示词落到当前工作流画布节点',
    when: '用户要把设定/提示词落到当前画布；args.mode=image|video，可选 args.prompt',
  },
  {
    name: 'run_node',
    label: '运行节点',
    desc: '运行画布上指定或当前选中节点',
    when: '用户要跑某个节点/重新生成；args.nodeId 可选（缺省=当前选中）',
  },
  {
    name: 'add_node',
    label: '添加节点',
    desc: '在当前画布添加节点',
    when: '用户要加文本/备注/Agent/图片/视频节点；args.type=input.text|input.note|ai.chat|ai.image|ai.video',
  },
  {
    name: 'select_node',
    label: '选中节点',
    desc: '聚焦画布节点',
    when: '需要用户注意某节点时；args.nodeId 必填',
  },
  {
    name: 'set_param',
    label: '改节点参数',
    desc: '更新节点 prompt 等参数',
    when: '用户要改某节点提示词；args.nodeId + args.key + args.value',
  },
];

/** 注入 system：能力地图 + action 协议 */
export function buildCapabilityPrompt(): string {
  const skillHints = listChatSkills()
    .filter((s) =>
      [
        'plot-architect',
        'character-bible',
        'image-prompt-pro',
        'shot-table',
        'hook-rewriter',
        'style-lock',
      ].includes(s.id),
    )
    .map((s) => `- ${s.id}（/${s.slash || s.id}）：${s.name} — ${s.desc}`)
    .join('\n');
  const actions = CHAT_ACTION_DEFS.map(
    (a) => `- ${a.name}：${a.desc}。何时用：${a.when}`,
  ).join('\n');
  return [
    '—— 系统能力（必须理解用户意图并调用）——',
    '你不只是聊天：当用户意图明确时，用 ```action 代码块声明要调用的系统能力，前端会执行。',
    '你拥有「当前工作流画布」的创作权限：可建议并声明 run_node / add_node / set_param / to_canvas / select_node。',
    '可先简短说明你要做什么，再输出 1 个（必要时 2 个）action。不要假装已经生成了图/视频/画布节点。',
    '',
    '【技能 skillId 一览】',
    skillHints || '- （暂无预置技能，可用 Hub 同步后的技能）',
    '',
    '【动作 name 一览】',
    actions,
    '',
    '【action 格式】仅 JSON，可多块：',
    '```action',
    '{"name":"run_skill","args":{"skillId":"character-bible","extra":"石小山等人"}}',
    '```',
    '```action',
    '{"name":"to_canvas","args":{"mode":"image"}}',
    '```',
    '```action',
    '{"name":"run_node","args":{"nodeId":"…"}}',
    '```',
    '',
    '【意图示例】',
    '· 「角色圣经/人设/定妆」→ run_skill character-bible',
    '· 「设定板/多人多场景/落画布」→ 角色各一条 ```image + 场景各一条 ```image（环境），再 to_canvas mode=image',
    '· 「成片/Seedance 运动」→ ```video + to_canvas mode=video',
    '· 「跑一下这个节点/重新生成」→ run_node',
    '· 「加一个视频节点」→ add_node type=ai.video',
    '· 「帮我设计剧情」→ run_skill plot-architect',
    '不确定时先问一句，不要乱调动作。',
  ].join('\n');
}

/** 当前画布快照，注入对话 system，让模型「看得见」工作流 */
export function buildCanvasContextPrompt(snapshot?: {
  workflowId?: string;
  workflowName?: string;
  selectedIds?: string[];
  nodes?: Array<{ id: string; type: string; label: string; prompt?: string; status?: string }>;
  edges?: Array<{ source: string; target: string }>;
} | null): string {
  if (!snapshot) return '';
  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
  const edges = Array.isArray(snapshot.edges) ? snapshot.edges : [];
  const selected = Array.isArray(snapshot.selectedIds) ? snapshot.selectedIds : [];
  const lines = [
    '—— 当前工作流画布（只读快照；改动请用 action）——',
    `工作流：${snapshot.workflowName || '未命名'}（id=${snapshot.workflowId || '?'}）`,
    `节点数 ${nodes.length} · 连线 ${edges.length}`,
  ];
  if (selected.length) lines.push(`当前选中：${selected.join(', ')}`);
  if (!nodes.length) {
    lines.push('画布为空：可先 add_node，或 to_canvas 落地提示词。');
  } else {
    lines.push('节点列表（最多 40）：');
    for (const n of nodes.slice(0, 40)) {
      const p = String(n.prompt || '').replace(/\s+/g, ' ').trim();
      const tip = p ? ` · prompt=${p.slice(0, 80)}${p.length > 80 ? '…' : ''}` : '';
      const st = n.status ? ` · ${n.status}` : '';
      lines.push(`- ${n.id} [${n.type}] ${n.label || ''}${st}${tip}`);
    }
    if (edges.length) {
      lines.push('连线（最多 30）：');
      for (const e of edges.slice(0, 30)) {
        lines.push(`- ${e.source} → ${e.target}`);
      }
    }
  }
  lines.push(
    '创作原则：优先复用/改写现有节点；大改前先说明；落媒体用 ```image/```video + to_canvas；运行用 run_node。',
  );
  return lines.join('\n');
}

export function extractChatActions(text: string): ChatAction[] {
  const blocks = String(text || '').match(/```action\s*\n([\s\S]*?)```/gi) || [];
  const out: ChatAction[] = [];
  for (const raw of blocks) {
    const body = raw.replace(/^```action\s*\n?/i, '').replace(/```$/i, '').trim();
    try {
      const j = JSON.parse(body);
      const name = String(j?.name || '').trim() as ChatActionName;
      if (!CHAT_ACTION_DEFS.some((d) => d.name === name)) continue;
      const args = j.args && typeof j.args === 'object' ? j.args : {};
      out.push({
        name,
        args,
        label: actionLabel({ name, args }),
      });
    } catch {
      /* skip */
    }
  }
  return out;
}

export function stripActionFences(text: string): string {
  return String(text || '')
    .replace(/```action\s*\n[\s\S]*?```/gi, '')
    .replace(/```action\s*\n[\s\S]*$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

export function actionLabel(a: ChatAction): string {
  if (a.name === 'run_skill') {
    const id = String(a.args?.skillId || '');
    const sk = findChatSkill(id);
    return sk ? `运行「${sk.name}」` : '运行技能';
  }
  const def = CHAT_ACTION_DEFS.find((d) => d.name === a.name);
  return def?.label || a.name;
}

/** 用户话术 → 高置信意图（发送前短路，提升「一说就懂」） */
export function matchUserIntent(text: string): ChatAction | null {
  const t = String(text || '').trim();
  if (!t || t.length > 200) return null;

  if (/(生成到画布|落到画布|放到画布|创建工作流|设定板.*画布|画布.*设定|分组.*画布)/i.test(t)) {
    // 设定板/分组一律生图；仅明确要成片时才走视频
    const mode = /成片|视频|seedance/i.test(t) && !/设定|角色|场景|分组/i.test(t) ? 'video' : 'image';
    return {
      name: 'to_canvas',
      args: { mode },
      label: mode === 'image' ? '落画布·短剧流水线' : '生成到画布',
    };
  }

  // 设定板 / 多角色场景 → 出图技能（再由模型或 to_canvas 落地）
  if (/设定板|多角色.*场景|角色.*场景.*一张|一张图.*(角色|场景)|一人一图|一角一图/i.test(t)) {
    return {
      name: 'run_skill',
      args: {
        skillId: 'image-prompt-pro',
        extra: `${t}\n\n（要求：每个角色单独一条 \`\`\`image，每个场景单独一条 \`\`\`image；一人一图、一景一图，不要合并。）`,
      },
      label: '写设定板出图提示',
    };
  }

  // 技能关键词
  const skillRules: Array<[RegExp, string]> = [
    [/角色圣经|人设|定妆|角色设定/i, 'character-bible'],
    [/设计剧情|剧情架构|帮我编故事|主线大纲/i, 'plot-architect'],
    [/出图提示|生图提示|文生图提示/i, 'image-prompt-pro'],
    [/画风锁定|统一画风/i, 'style-lock'],
    [/前三秒|开场钩子/i, 'hook-rewriter'],
    [/分镜速览|快速分镜/i, 'shot-table'],
  ];
  for (const [re, skillId] of skillRules) {
    if (re.test(t)) {
      return {
        name: 'run_skill',
        args: { skillId, extra: t },
        label: actionLabel({ name: 'run_skill', args: { skillId } }),
      };
    }
  }
  return null;
}
