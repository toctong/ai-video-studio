/**
 * Apply EXTRA5 ultimate fields into shots-*.ts by id prefix + row number.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EXTRA5 } from './shot-library-extra5-ultimates.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../src/modules/libraries/data');

const FILE_PREFIX = {
  anime: { file: 'shots-anime.ts', prefixes: ['shot-acg-', 'shot-an-'] },
  guofeng: { file: 'shots-guofeng.ts', prefixes: ['shot-gf-'] },
  weird: { file: 'shots-weird.ts', prefixes: ['shot-wd-', 'shot-we-'] },
  scifi: { file: 'shots-scifi.ts', prefixes: ['shot-sf-'] },
  retro: { file: 'shots-retro.ts', prefixes: ['shot-rt-', 'shot-rv-'] },
  traditional: { file: 'shots-traditional.ts', prefixes: ['shot-tr-', 'shot-td-'] },
  commercial: { file: 'shots-commercial.ts', prefixes: ['shot-cm-', 'shot-co-'] },
  realism: { file: 'shots-realism.ts', prefixes: ['shot-rl-', 'shot-re-'] },
};

const SCALE =
  '大招规格：名字含千/万/阵/域/决/开天/破界/灭世者须满屏体量（暴雨成幕/罩敌半屏），禁止缩成几道小特效；本命兵器握柄不断；禁止烧录技能大字。';

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function setField(block, field, value) {
  const re = new RegExp(`(${field}: ')([^']*)(')`);
  if (!re.test(block)) return block;
  return block.replace(re, `$1${esc(value)}$3`);
}

let updated = 0;
let missed = [];
for (const [family, rows] of Object.entries(EXTRA5)) {
  const meta = FILE_PREFIX[family];
  if (!meta) continue;
  const p = path.join(dataDir, meta.file);
  let text = fs.readFileSync(p, 'utf8');
  for (const row of rows) {
    const [n, label, style, blurb, , cam, mov, vfx, , seed] = row;
    let id = null;
    for (const pref of meta.prefixes) {
      const candidate = `${pref}${n}`;
      if (text.includes(`id: '${candidate}'`)) {
        id = candidate;
        break;
      }
    }
    if (!id) {
      missed.push(`${family}/${n}/${label}`);
      continue;
    }
    const start = text.indexOf(`id: '${id}'`);
    if (start < 0) {
      missed.push(id);
      continue;
    }
    const brace = text.lastIndexOf('{', start);
    const end = text.indexOf('\n  },', start);
    if (brace < 0 || end < 0) {
      missed.push(id + ':bad-span');
      continue;
    }
    let block = text.slice(brace, end);
    const fullBlurb =
      blurb.includes('·') || blurb.startsWith('国风') || blurb.startsWith('二次元')
        ? blurb
        : family === 'guofeng'
          ? `国风东方·${style}：${blurb}`
          : family === 'anime'
            ? `二次元动漫·${style}：${blurb}`
            : blurb;
    let finalSeed = seed;
    if (!/大招规格/.test(finalSeed)) finalSeed = `${finalSeed} ${SCALE}`;
    if (!/终局硬锁|打中对手/.test(finalSeed)) {
      finalSeed = `${finalSeed} 终局硬锁：大招必须打中对手；场景形变若有须同轴余波；禁止互捅、禁止人站着背景自炸。`;
    }
    block = setField(block, 'label', label);
    block = setField(block, 'blurb', fullBlurb);
    block = setField(block, 'cameraFocus', cam);
    block = setField(block, 'moveFocus', mov);
    block = setField(block, 'vfxFocus', vfx);
    block = setField(block, 'seed', finalSeed);
    text = text.slice(0, brace) + block + text.slice(end);
    updated += 1;
  }
  fs.writeFileSync(p, text, 'utf8');
}
console.log('synced EXTRA5 ultimate shots:', updated);
if (missed.length) console.log('missed:', missed.slice(0, 20).join(' | '), missed.length > 20 ? `...+${missed.length - 20}` : '');
