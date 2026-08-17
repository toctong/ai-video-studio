/**
 * 把资源库数据从短剧/漫剧措辞改成「长篇网文」向（就地改 backend data）。
 * 用法：node scripts/retarget-libraries-novel.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../backend/src/modules/libraries/data');

function rewriteText(s) {
  return String(s || '')
    .replaceAll('适合漫剧分镜与角色定妆', '适合小说封面与角色定妆')
    .replaceAll('漫剧分镜', '小说封面')
    .replaceAll('短剧特效友好', '爽点画面感强')
    .replaceAll('短剧卡点', '章末卡点')
    .replaceAll('短剧强卡点', '章末强悬念')
    .replaceAll('短剧', '网文')
    .replaceAll('下集标题', '下章标题')
    .replaceAll('下集', '下章')
    .replaceAll('本集', '本章')
    .replaceAll('每集', '每章')
    .replaceAll('五集', '五段小弧')
    .replaceAll('第1集', '第1段')
    .replaceAll('第2集', '第2段')
    .replaceAll('第3集', '第3段')
    .replaceAll('第4集', '第4段')
    .replaceAll('第5集', '第5段')
    .replaceAll(/(\d)\s*集/g, '$1章')
    .replaceAll('竖屏', '连载');
}

const CATEGORY_MAP = {
  短剧五集: '短线爽点节奏',
  短剧竖屏: '高速推进节奏',
  集末卡点: '章末付费钩',
  短剧简介: '一句话卖点',
};

/** 加厚「长篇卷结构」条目内容 */
const VOLUME_PACING_UPGRADES = [
  {
    match: /长篇卷结构/,
    labelIncludes: '卷一',
    content: [
      '长篇卷结构（目标全书约 150～250 万字，可按题材伸缩）：',
      '【总览】建议 5～8 卷；每卷 20～40 万字；日更按 2000～4000 字/章，每卷约 80～150 章。',
      '【卷一·建置】立人设、立规则、立欲望；前 3 章强钩子；前 30 章完成第一次小翻盘。',
      '【卷二·扩张】地图/势力升级；引入长期对手；埋跨卷悬念。',
      '【卷三～五·对抗升级】每隔 1 卷一次中爽，每隔 2～3 卷一次大爽；禁止无铺垫开挂。',
      '【末卷·收束】兑现承诺、清理钩子、人物弧光落地；可留轻微续作空间但主线闭环。',
      '【日常节奏】小爽（章内）→ 中爽（十章级）→ 大爽（卷末）；章末必留可接钩。',
    ].join('\n'),
  },
];

function transformFile(fileName) {
  const fp = path.join(dataDir, fileName);
  let raw = fs.readFileSync(fp, 'utf8');
  const before = raw;

  for (const [from, to] of Object.entries(CATEGORY_MAP)) {
    raw = raw.replaceAll(`"category": "${from}"`, `"category": "${to}"`);
    raw = raw.replaceAll(`"id": "pacing-${from}`, `"id": "pacing-${to}`);
    raw = raw.replaceAll(`"id": "hook-${from}`, `"id": "hook-${to}`);
    raw = raw.replaceAll(`"id": "title-${from}`, `"id": "title-${to}`);
    raw = raw.replaceAll(`pacing-${from}-`, `pacing-${to}-`);
    raw = raw.replaceAll(`hook-${from}-`, `hook-${to}-`);
    raw = raw.replaceAll(`title-${from}-`, `title-${to}-`);
  }

  // tags 数组里的短剧等
  raw = raw.replaceAll('"短剧"', '"网文"');
  raw = raw.replaceAll('"五集"', '"短线"');
  raw = raw.replaceAll('"竖屏"', '"连载"');
  raw = raw.replaceAll('"集末"', '"章末"');

  raw = rewriteText(raw);

  if (fileName === 'pacing.ts') {
    // 给长篇卷结构补一段更可用的模板：替换过于单薄的 content
    raw = raw.replace(
      /("category": "长篇卷结构"[\s\S]*?"content": ")([^"]*)(")/g,
      (full, a, content, c) => {
        if (content.length > 80 && !/节奏：卷一/.test(content)) return full;
        const upgraded = [
          '长篇卷结构（按百万字连载设计）：',
          '1) 先写总卷纲（5～8卷），每卷一句话主线+本卷大敌+卷末兑现点。',
          '2) 再写首卷细目录（建议 30～50 章）：章标题+本章目标+章末钩子。',
          '3) 后续卷只保留卷纲与关键大节点，边写边细化，避免一次性写死千章。',
          '4) 节奏：小爽在章内，中爽每 10～20 章，大爽放卷末；人物代价必须跟上。',
          '5) 禁止按短剧五集压缩全书；支线服务主线，不无限制开新图。',
        ].join('\\n');
        return `${a}${upgraded}${c}`;
      },
    );
  }

  if (raw !== before) {
    fs.writeFileSync(fp, raw, 'utf8');
    console.log('updated', fileName);
  } else {
    console.log('unchanged', fileName);
  }
}

for (const f of ['pacing.ts', 'hooks.ts', 'titles.ts', 'styles.ts', 'tropes.ts', 'dialogues.ts']) {
  transformFile(f);
}

console.log('done');
