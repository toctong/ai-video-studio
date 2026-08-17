import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const headers = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  referer: 'https://www.namistory.com/',
};

async function get(url) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  console.log(res.status, url.slice(-60), text.length);
  return text;
}

const html = await get('https://www.namistory.com/');
const assetUrls = [...html.matchAll(/https:\/\/qcdn\.zhaomi\.cn\/assistant\/assets\/[^"']+\.js/g)].map((m) => m[0]);
const localNames = [...html.matchAll(/\/assets\/([a-zA-Z0-9._-]+\.js)/g)].map((m) => m[1]);
console.log('assets', assetUrls.length, localNames.slice(0, 20));

const keywords = [
  '全能参考',
  '图生视频',
  '多宫格',
  '生分镜',
  'videoGen',
  'omni',
  'i2v',
  'grid',
  'hover',
  'preview',
  '.mp4',
  '.webp',
];

const hits = [];
for (const name of localNames.slice(0, 40)) {
  const url = `https://qcdn.zhaomi.cn/assistant/assets/${name}`;
  try {
    const text = await get(url);
    fs.writeFileSync(path.join(root, `tmp-asset-${name}`), text);
    for (const kw of keywords) {
      if (text.includes(kw)) hits.push({ name, kw, count: text.split(kw).length - 1 });
    }
  } catch (e) {
    console.log('fail', name, e.message);
  }
}

// also scan home chunk already downloaded
for (const f of ['tmp-home.js', 'tmp-nami-home.js']) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf8');
  for (const kw of keywords) {
    if (text.includes(kw)) hits.push({ name: f, kw, count: text.split(kw).length - 1 });
  }
}

console.log('HITS');
console.log(hits.sort((a, b) => b.count - a.count).slice(0, 80));
