export type PluginKind = 'provider' | 'mcp' | 'builtin';

export type PluginCatalogItem = {
  id: string;
  name: string;
  description: string;
  group: string;
  color: string;
  /** 卡片角标两字 */
  icon: string;
  kind: PluginKind;
  enabled: boolean;
  order: number;
  dialogWidth?: number;
  /** 参考开源 / 协议来源说明 */
  repoHint?: string;
  /** 打开后主行动 */
  primaryAction?: {
    label: string;
    /** home | assemble | libraries | script | settings | libraries:<kind> */
    target: string;
  };
};

export type PluginToolDef = {
  name: string;
  description: string;
  /** 对应产品能力 */
  serves: string;
};

/** 各 MCP 插件暴露的工具清单（供插件中心展示 / 后续真 MCP 挂载） */
export const PLUGIN_TOOLS: Record<string, PluginToolDef[]> = {
  'mcp-assemble': [
    { name: 'suggest_blocks', description: '根据选定剧本关联设定/人物/节奏/桥段等积木', serves: '工作台积木拼装' },
    { name: 'compose_brief', description: '把多块积木合成通顺的大纲输入', serves: '一键整合生成' },
    { name: 'assign_story_roles', description: '为人设原型指定主角/对手/配角身份', serves: '人物导入' },
  ],
  'mcp-outline': [
    { name: 'generate_outline', description: '生成长篇连载大纲（分卷 + 首卷细章）', serves: '项目大纲' },
    { name: 'expand_beats', description: '把三幕骨架扩成章末钩子与爽点清单', serves: '大纲加厚' },
    { name: 'regen_outline', description: '按新灵感重写大纲并保留主线约束', serves: '写作页·查看大纲' },
  ],
  'mcp-logline': [
    { name: 'refine_logline', description: '打磨一句话卖点与核心矛盾', serves: '新建项目简介' },
    { name: 'title_variants', description: '给出书名/一句话卖点备选', serves: '标题 & 简介库' },
    { name: 'pitch_card', description: '输出类型定位 + 读者预期短卡', serves: '项目概览' },
  ],
  'mcp-chapter': [
    { name: 'generate_next_chapter', description: '按大纲与人物圣经写下一章正文', serves: '写作页·生成下一章' },
    { name: 'rewrite_chapter', description: '在既有章卡约束下重写本章', serves: '章节重写' },
    { name: 'continuity_summary', description: '生成本章承接摘要供下一章使用', serves: '分章连贯' },
  ],
  'mcp-deai': [
    { name: 'deai_polish', description: '去掉空泛 AI 腔，保留信息密度与口语感', serves: '章节去味' },
    { name: 'style_lock', description: '按文风规则锁定用词与对话口吻', serves: '正文润色' },
  ],
  'mcp-dialogue': [
    { name: 'dialogue_pass', description: '按台词模板库润色对白潜台词', serves: '章节对话' },
    { name: 'voice_diff', description: '检查不同角色说话是否可区分', serves: '人物声口' },
  ],
  'mcp-bible': [
    { name: 'extract_characters', description: '从大纲提取 8–14 人人物圣经', serves: '从大纲提取' },
    { name: 'import_archetype', description: '从角色库导入人设原型并取剧中名', serves: '角色库导入' },
    { name: 'export_bible_docx', description: '导出人物设定 Word', serves: '导出人物设定' },
  ],
  'mcp-continuity': [
    { name: 'check_consistency', description: '扫描人物设定与正文矛盾点', serves: '写作质检' },
    { name: 'track_open_hooks', description: '整理未回收悬念与章末钩子', serves: '故事状态' },
    { name: 'timeline_note', description: '维护时间线备忘，防穿帮', serves: '项目 storyState' },
  ],
  'mcp-pacing': [
    { name: 'apply_pacing_template', description: '套用长篇分卷/三幕/爽文节奏模板', serves: '节奏模板库' },
    { name: 'density_audit', description: '检查小爽/中爽/大爽兑现密度', serves: '大纲节奏' },
  ],
  'mcp-trope': [
    { name: 'pick_tropes', description: '按题材推荐桥段组合', serves: '桥段库' },
    { name: 'pick_hooks', description: '推荐开篇与集末钩子', serves: '钩子库' },
    { name: 'pick_lore', description: '推荐世界观与金手指设定骨架', serves: '设定模板库' },
  ],
  'mcp-export': [
    { name: 'export_chapter_docx', description: '单章导出 Word', serves: '章节导出' },
    { name: 'export_bible_docx', description: '人物圣经导出 Word', serves: '角色导出' },
  ],
  'llm-chat': [
    { name: 'chat_complete', description: '通用对话补全（大纲/章/润色共用底座）', serves: '全站写作调用' },
  ],
};

export const PLUGIN_CATALOG: PluginCatalogItem[] = [
  {
    id: 'llm-chat',
    name: '写作对话底座',
    description: '大纲、分章、去味、提取角色等能力的统一 Chat Completions 通道。',
    group: 'provider',
    color: 'linear-gradient(135deg, #6366f1, #4338ca)',
    icon: '对话',
    kind: 'builtin',
    enabled: true,
    order: 11,
    primaryAction: { label: '配置模型', target: 'settings' },
  },
  {
    id: 'mcp-assemble',
    name: '积木拼装 MCP',
    description: '选剧本 → 关联多库积木 → 一键整合大纲。服务工作台「新建项目」。',
    group: 'mcp-create',
    color: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    icon: '积',
    kind: 'mcp',
    enabled: true,
    order: 20,
    dialogWidth: 680,
    repoHint: '流程参考 Storywright / book-writer-mcp 的「先圣经再成稿」思路',
    primaryAction: { label: '打开积木拼装', target: 'assemble' },
  },
  {
    id: 'mcp-outline',
    name: '大纲策划 MCP',
    description: '多章大纲、人物表、爽点与章末钩子；可在写作页补生成或重写。',
    group: 'mcp-create',
    color: 'linear-gradient(135deg, #0ea5e9, #0369a1)',
    icon: '纲',
    kind: 'mcp',
    enabled: true,
    order: 21,
    dialogWidth: 680,
    repoHint: '结构参考 Save the Cat / ScripThis 分幕与覆盖评审习惯',
    primaryAction: { label: '去写作·大纲', target: 'script' },
  },
  {
    id: 'mcp-logline',
    name: '卖点 & 标题 MCP',
    description: '一句话卖点、标题备选与类型定位，对齐标题简介库。',
    group: 'mcp-create',
    color: 'linear-gradient(135deg, #06b6d4, #0e7490)',
    icon: '题',
    kind: 'mcp',
    enabled: true,
    order: 22,
    repoHint: '参考专业 logline 校验（冲突/欲望/代价三支柱）',
    primaryAction: { label: '打开标题库', target: 'libraries:titles' },
  },
  {
    id: 'mcp-trope',
    name: '桥段设定 MCP',
    description: '桥段 / 钩子 / 设定 / 节奏模板检索与组合，喂给拼装与大纲。',
    group: 'mcp-create',
    color: 'linear-gradient(135deg, #14b8a6, #0f766e)',
    icon: '桥',
    kind: 'mcp',
    enabled: true,
    order: 23,
    repoHint: '素材层对标网文桥段库与 chinese-webnovel-skills 类资源',
    primaryAction: { label: '打开桥段库', target: 'libraries:tropes' },
  },
  {
    id: 'mcp-chapter',
    name: '分章写作 MCP',
    description: '按大纲与人物圣经生成下一章、重写与承接摘要。',
    group: 'mcp-write',
    color: 'linear-gradient(135deg, #f59e0b, #d97706)',
    icon: '章',
    kind: 'mcp',
    enabled: true,
    order: 30,
    dialogWidth: 680,
    repoHint: '流水线参考 Storywright（writer→editor→approve）的分章推进',
    primaryAction: { label: '去写作·章节', target: 'script' },
  },
  {
    id: 'mcp-deai',
    name: '去 AI 味 MCP',
    description: '清理套话与假大空升华，保留大白话与可执行细节。',
    group: 'mcp-write',
    color: 'linear-gradient(135deg, #ef4444, #b91c1c)',
    icon: '味',
    kind: 'mcp',
    enabled: true,
    order: 31,
    primaryAction: { label: '去写作页使用', target: 'script' },
  },
  {
    id: 'mcp-dialogue',
    name: '台词润色 MCP',
    description: '结合台词模板库，拉开角色声口与潜台词。',
    group: 'mcp-write',
    color: 'linear-gradient(135deg, #f97316, #c2410c)',
    icon: '白',
    kind: 'mcp',
    enabled: true,
    order: 32,
    repoHint: '能力对标 ScripThis Dialogue Doctor 类技能',
    primaryAction: { label: '打开台词库', target: 'libraries:dialogues' },
  },
  {
    id: 'mcp-pacing',
    name: '叙事节奏 MCP',
    description: '长篇分卷 / 三幕 / 爽文密度体检与模板套用。',
    group: 'mcp-write',
    color: 'linear-gradient(135deg, #eab308, #a16207)',
    icon: '奏',
    kind: 'mcp',
    enabled: true,
    order: 33,
    primaryAction: { label: '打开节奏库', target: 'libraries:pacing' },
  },
  {
    id: 'mcp-bible',
    name: '人物圣经 MCP',
    description: '大纲提取、角色库导入（无姓名原型→项目取名）、Word 导出。',
    group: 'mcp-bible',
    color: 'linear-gradient(135deg, #a855f7, #7e22ce)',
    icon: '人',
    kind: 'mcp',
    enabled: true,
    order: 40,
    dialogWidth: 680,
    repoHint: '参考 book-writer-mcp / Scrivener-MCP 的 story bible 思路',
    primaryAction: { label: '去角色设定', target: 'script:characters' },
  },
  {
    id: 'mcp-continuity',
    name: '连续性检查 MCP',
    description: '人物矛盾、未回收钩子与时间线备忘，降低长篇穿帮。',
    group: 'mcp-bible',
    color: 'linear-gradient(135deg, #c026d3, #86198f)',
    icon: '连',
    kind: 'mcp',
    enabled: true,
    order: 41,
    repoHint: '对标 Scrivener-MCP check_consistency / 情节线程检查',
    primaryAction: { label: '去项目写作', target: 'script' },
  },
  {
    id: 'mcp-export',
    name: '文稿导出 MCP',
    description: '章节与人物设定导出 Word，便于外部审稿与出图。',
    group: 'mcp-export',
    color: 'linear-gradient(135deg, #64748b, #334155)',
    icon: '出',
    kind: 'mcp',
    enabled: true,
    order: 50,
    primaryAction: { label: '去写作页导出', target: 'script' },
  },
  {
    id: 'mcp-scrivener',
    name: 'Scrivener 桥接',
    description: '连接本地 Scrivener 工程的外部 MCP（读写文稿/语义检索）。即将接入。',
    group: 'mcp-export',
    color: 'linear-gradient(135deg, #94a3b8, #475569)',
    icon: 'Sv',
    kind: 'mcp',
    enabled: false,
    order: 51,
    repoHint: 'github.com/writerslogic/scrivener-mcp',
    primaryAction: { label: '了解开源方案', target: 'settings' },
  },
];

export const PLUGIN_GROUPS = [
  { id: 'provider', label: '接入与模型', hint: '凭证与对话底座；出图走 Hub 渠道 / 火山方舟' },
  { id: 'mcp-create', label: '书库创作', hint: '积木拼装、大纲灵感与素材库组合' },
  { id: 'mcp-write', label: '分章写作', hint: '分章生成、去味、台词与节奏' },
  { id: 'mcp-bible', label: '人物与连贯', hint: '人物圣经、钩子与时间线连贯' },
  { id: 'mcp-export', label: '导出与外部', hint: 'Word 导出与外部 MCP 桥接' },
];
