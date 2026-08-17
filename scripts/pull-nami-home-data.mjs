import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'frontend', 'public', 'nami-assets');
fs.mkdirSync(outDir, { recursive: true });

const headers = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  referer: 'https://www.namistory.com/',
  accept: '*/*',
};

async function getJson(url) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text.slice(0, 500), status: res.status };
  }
}

const bannerApi =
  'https://www.namistory.com/api/config/cloud?appsource=so&key=nano_pc_pvideo_home_baner';
const boardApi =
  'https://www.namistory.com/api/config/cloud?appsource=so&key=nano_pc_pvideo_home_top_board';
const recoApi =
  'https://www.namistory.com/api/nami/public/namistory/home/reco_list?appsource=so&page=1&page_size=20';
const catsApi =
  'https://www.namistory.com/api/nami/public/namistory/home/reco_categories?appsource=so';
const homeJs = 'https://qcdn.zhaomi.cn/assistant/assets/home-CFO2t3S8.js';

const [banner, board, reco, cats, homeJsText] = await Promise.all([
  getJson(bannerApi),
  getJson(boardApi),
  getJson(recoApi),
  getJson(catsApi),
  fetch(homeJs, { headers }).then((r) => r.text()),
]);

fs.writeFileSync(path.join(root, 'tmp-nami-banner.json'), JSON.stringify(banner, null, 2));
fs.writeFileSync(path.join(root, 'tmp-nami-board.json'), JSON.stringify(board, null, 2));
fs.writeFileSync(path.join(root, 'tmp-nami-reco.json'), JSON.stringify(reco, null, 2));
fs.writeFileSync(path.join(root, 'tmp-nami-cats.json'), JSON.stringify(cats, null, 2));
fs.writeFileSync(path.join(root, 'tmp-nami-home.js'), homeJsText);

const urls = new Set();
function walk(v) {
  if (!v) return;
  if (typeof v === 'string') {
    if (/^https?:\/\//i.test(v) && /\.(png|jpe?g|webp|gif|svg|mp4)(\?|$)/i.test(v)) urls.add(v);
    if (/^https?:\/\/.*(qhimg|qhres|zhaomi|chat\.360)/i.test(v)) urls.add(v);
    return;
  }
  if (Array.isArray(v)) return v.forEach(walk);
  if (typeof v === 'object') Object.values(v).forEach(walk);
}
walk(banner);
walk(board);
walk(reco);
walk(cats);

for (const m of homeJsText.matchAll(/https?:\\\/\\\/[^"'\\]+/g)) {
  const u = m[0].replace(/\\\//g, '/');
  if (/\.(png|jpe?g|webp|gif|svg|mp4)(\?|$)/i.test(u)) urls.add(u);
}
for (const m of homeJsText.matchAll(/["'](https?:[^"']+\.(?:png|jpe?g|webp|gif|svg|mp4)[^"']*)["']/g)) {
  urls.add(m[1]);
}

console.log('api image urls', urls.size);
console.log([...urls].slice(0, 60).join('\n'));
console.log('banner keys', banner && typeof banner === 'object' ? Object.keys(banner) : typeof banner);
console.log('banner sample', JSON.stringify(banner).slice(0, 800));
