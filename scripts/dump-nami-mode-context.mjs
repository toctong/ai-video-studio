import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function dumpAround(file, needle, pad = 400) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  let idx = 0;
  let n = 0;
  while ((idx = text.indexOf(needle, idx)) >= 0 && n < 8) {
    console.log('\n====', file, needle, 'at', idx, '====');
    console.log(text.slice(Math.max(0, idx - pad), idx + pad));
    idx += needle.length;
    n++;
  }
}

for (const f of ['tmp-home.js', 'tmp-nami-home.js', 'tmp-asset-index-DTnFVojr.js']) {
  if (!fs.existsSync(path.join(root, f))) continue;
  for (const kw of ['全能参考', '图生视频', '多宫格', '生分镜视频', '多参考直出', '关键帧可控', '连贯分格']) {
    dumpAround(f, kw, 500);
  }
}

// extract mp4/webp urls near mode keywords from index
const indexPath = path.join(root, 'tmp-asset-index-DTnFVojr.js');
if (fs.existsSync(indexPath)) {
  const text = fs.readFileSync(indexPath, 'utf8');
  const urls = new Set();
  for (const m of text.matchAll(/https?:\\\/\\\/[^"'\\]+?\.(?:mp4|webp|png|jpg)[^"'\\]*/g)) {
    urls.add(m[0].replace(/\\\//g, '/'));
  }
  for (const m of text.matchAll(/https?:\/\/[^"'\\\s)]+\.(?:mp4|webp|png|jpe?g)[^"'\\\s)]*/g)) {
    urls.add(m[0].replace(/[,);]+$/, ''));
  }
  console.log('\nINDEX MEDIA URLS', [...urls].slice(0, 100).join('\n'));
}

// find dynamic import chunk names mentioning film/create/setting/mode
const index = fs.readFileSync(indexPath, 'utf8');
const chunks = new Set();
for (const m of index.matchAll(/["']([^"']*(?:film|create|setting|mode|pvideo|story|shot|video)[^"']*\.js)["']/gi)) {
  chunks.add(m[1]);
}
for (const m of index.matchAll(/assets\/([a-zA-Z0-9_-]+\.js)/g)) {
  if (/film|creat|set|mode|pvideo|story|shot|video|script/i.test(m[1])) chunks.add(m[1]);
}
console.log('\nCHUNK CANDIDATES', [...chunks].slice(0, 80));
