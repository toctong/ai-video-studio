/**
 * Patch existing shot seeds: append ultimate scale lock for fight shots.
 * Run: node backend/scripts/patch-shot-ultimate-scale.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../src/modules/libraries/data');
const SCALE =
  '大招规格：名字含千/万/阵/域/决/开天/破界/灭世者须满屏体量（暴雨成幕/罩敌半屏），禁止缩成几道小特效；本命兵器握柄不断；禁止烧录技能大字。';

const files = fs
  .readdirSync(dataDir)
  .filter((f) => f.startsWith('shots-') && f.endsWith('.ts'));

let patched = 0;
for (const f of files) {
  const p = path.join(dataDir, f);
  let t = fs.readFileSync(p, 'utf8');
  const next = t.replace(
    /seed: '((?:\\'|[^'])*)'/g,
    (full, seed) => {
      const raw = seed.replace(/\\'/g, "'");
      if (!/超燃|大招|对决|对斩|归宗|齐发|焚天|破界|刀域|开天|棍扫|千枪|万剑|火龙/.test(raw + f)) {
        // only touch if seed itself looks fight-related
        if (!/大招|对决|对斩|归宗|齐发|焚天|破界|刀域|开天|棍扫|千枪|万剑|火龙|技能硬锁|终局硬锁|拉风/.test(raw)) {
          return full;
        }
      }
      if (/大招规格|暴雨成幕|禁止缩成几道/.test(raw)) return full;
      const updated = `${raw} ${SCALE}`.replace(/'/g, "\\'");
      patched += 1;
      return `seed: '${updated}'`;
    },
  );
  if (next !== t) fs.writeFileSync(p, next, 'utf8');
}
console.log('patched seeds:', patched);
