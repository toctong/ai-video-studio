/**
 * Download nami-style media for 生分镜视频方式 cards.
 * Sources: public CDN assets already used on namistory homepage / UI.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'frontend', 'public', 'nami', 'modes');
fs.mkdirSync(outDir, { recursive: true });

const headers = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  referer: 'https://www.namistory.com/',
  accept: '*/*',
};

/** Map our mode ids to public preview assets scraped from namistory CDN */
const assets = {
  omni: {
    cover: 'https://p0.ssl.qhimg.com/t110b9a93013e585359e0dc8c3f.png',
    badge: 'https://p4.ssl.qhimg.com/t110b9a930193b3196d24616a75.png',
    video: 'https://ns.chat.360.cn/zhaomi-so/e94e25f8be890c92b30a8d817d9cf441.mp4',
  },
  i2v: {
    cover: 'https://p3.ssl.qhimg.com/t110b9a9301af8687adaedfc31b.png',
    badge: 'https://p4.ssl.qhimg.com/t110b9a930193b3196d24616a75.png',
    video: 'https://ns.chat.360.cn/zhaomi-so/c236f3d1dcaa17f276f3ffbb3edb7619.mp4',
  },
  grid: {
    cover: 'https://p4.ssl.qhimg.com/t110b9a93019866419e7a56fd59.png',
    video: 'https://ns.chat.360.cn/zhaomi-so/b8b0b813daf27b2f0442f25bfbc91235.mp4',
  },
};

async function download(url, dest) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  console.log('ok', path.basename(dest), buf.length);
}

const manifest = {};
for (const [id, item] of Object.entries(assets)) {
  const row = {};
  const coverName = `${id}-cover.png`;
  await download(item.cover, path.join(outDir, coverName));
  row.cover = `/nami/modes/${coverName}`;
  if (item.badge) {
    const badgeName = `${id}-badge.png`;
    await download(item.badge, path.join(outDir, badgeName));
    row.badge = `/nami/modes/${badgeName}`;
  }
  const videoName = `${id}-preview.mp4`;
  await download(item.video, path.join(outDir, videoName));
  row.video = `/nami/modes/${videoName}`;
  manifest[id] = row;
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
