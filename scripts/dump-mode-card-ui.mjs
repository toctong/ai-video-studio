import fs from 'fs';

const t = fs.readFileSync('tmp-store1.js', 'utf8');
const i = t.indexOf('video-creator-selection-option w-264px');
console.log(t.slice(i - 200, i + 2200));

const j = t.indexOf('function Lt');
const k = t.indexOf('const Lt=');
const m = t.indexOf('Lt=({videoUrl');
console.log('\nLt idxs', j, k, m);
for (const idx of [k, m, t.indexOf('videoUrl:e')].filter((x) => x >= 0)) {
  console.log('\n====', idx);
  console.log(t.slice(idx, idx + 1500));
}
