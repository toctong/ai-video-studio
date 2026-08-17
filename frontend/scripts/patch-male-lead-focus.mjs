import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lib = path.join(__dirname, '../src/libraries');

// --- scripts.ts ---
const scriptsPath = path.join(lib, 'scripts.ts');
let scripts = fs.readFileSync(scriptsPath, 'utf8');
const scriptReplacements = [
  ['布局：主角首次反击，对手侧目。', '布局：男主首次反击，对手侧目。'],
  [
    '节奏适合竖屏短漫/短剧，每集留悬念钩子。',
    '默认男主主视角；女主可作情感线或关键配。节奏适合网文连载，章末留钩子。',
  ],
  ['都市重生。主角被合伙人陷害', '都市重生。男主被合伙人陷害'],
  ['离婚冷静期内女主反向布局资产与真相。', '离婚冷静期内男主反向布局资产与真相。'],
  ['签字前三天，她查清丈夫秘密。', '签字前三天，他查清妻子秘密。'],
  ['店被平台误封，女主跨境重建渠道反超。', '店被平台误封，男主跨境重建渠道反超。'],
  ['封店危机下，她三天重建供应链。', '封店危机下，他三天重建供应链。'],
  ['地铁爆炸循环，主角寻找引爆者。', '地铁爆炸循环，男主寻找引爆者。'],
  ['主角发现全城人都在同一倒计时。', '男主发现全城人都在同一倒计时。'],
  ['替身死后，主角开始做他的梦。', '替身死后，男主开始做他的梦。'],
  ['女主醒来丢失一天记忆，现场有血。', '男主醒来丢失一天记忆，现场有血。'],
  ['监控显示她消失了二十四小时。', '监控显示他消失了二十四小时。'],
  ['艺人塌房夜，她力挽狂澜。', '艺人塌房夜，他力挽狂澜。'],
  ['团购被掐供，她另起炉灶。', '团购被掐供，他另起炉灶。'],
  ['进场三天，她让上市梦碎。', '进场三天，他让上市梦碎。'],
];
for (const [from, to] of scriptReplacements) {
  scripts = scripts.split(from).join(to);
}
fs.writeFileSync(scriptsPath, scripts, 'utf8');
console.log('patched scripts.ts');

// --- characters.ts ---
const charsPath = path.join(lib, 'characters.ts');
let charsSrc = fs.readFileSync(charsPath, 'utf8');
charsSrc = charsSrc.split('性格气质贴合人设，适合漫剧定妆与分镜一致性。').join(
  '性格气质贴合人设，适合小说人设与后续定妆一致性。',
);

const match = charsSrc.match(
  /export const CHARACTER_LIBRARY: CharacterLibraryItem\[\] = (\[[\s\S]*?\n\]);/,
);
if (!match) {
  console.error('failed to parse CHARACTER_LIBRARY');
  process.exit(1);
}
const items = JSON.parse(match[1]);
const FEMALE =
  /女|少女|姑娘|千金|宫女|妃|圣女|修女|御兽|天骄女|冰修|魔道圣|摄政|女将|女官|黑客少女|丹谷/;

let male = 0;
let female = 0;
for (const it of items) {
  const isFemale = FEMALE.test(String(it.label || ''));
  const tag = isFemale ? '女主向' : '男主向';
  if (isFemale) female += 1;
  else male += 1;
  const tags = Array.isArray(it.tags) ? [...it.tags] : [];
  const cleaned = tags.filter((t) => t !== '男主向' && t !== '女主向' && t !== '人设');
  cleaned.push(tag, '人设');
  it.tags = cleaned;
}

const footer = `
export const CHARACTER_CATEGORIES = Array.from(
  new Set(CHARACTER_LIBRARY.map((i) => i.category)),
);
`;
const header = `import type { CharacterLibraryItem } from './types';\n\nexport const CHARACTER_LIBRARY: CharacterLibraryItem[] = `;
fs.writeFileSync(charsPath, `${header}${JSON.stringify(items, null, 2)};\n${footer}`, 'utf8');
console.log(`patched characters.ts: ${items.length} items, 男主向 ${male}, 女主向 ${female}`);
