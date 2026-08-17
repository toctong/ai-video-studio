import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'frontend', 'public', 'nami');
const iconDir = path.join(outDir, 'icons');
const bannerDir = path.join(outDir, 'banners');
const entryDir = path.join(outDir, 'entry');
const worksDir = path.join(outDir, 'works');
for (const d of [outDir, iconDir, bannerDir, entryDir, worksDir]) fs.mkdirSync(d, { recursive: true });

const headers = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  referer: 'https://www.namistory.com/',
  accept: '*/*',
};

const assets = {
  logo: 'https://p4.ssl.qhimg.com/t110b9a9301e773fa89b5513e8a.png',
  favicon: 'https://s5.ssl.qhres2.com/static/1d036ee171d75707.svg',
  brandWord: 'https://qcdn2.zhaomi.cn/t11de4588165816024caa796b42.png',
  vipSpark: 'https://s1.ssl.qhres2.com/static/69c7f25072378b76.svg',
  homeActiveBg: 'https://p3.ssl.qhimg.com/t110b9a93019f6a9813be5ac9ef.png',
  banners: [
    'https://qcdn4.zhaomi.cn/t11de4588167bef4067b997af25.png',
    'https://qcdn3.zhaomi.cn/t11de458816ca2712c0a76a0cdb.png',
    'https://qcdn2.zhaomi.cn/t11de4588160656763a52331034.png',
    'https://qcdn3.zhaomi.cn/t11de458816f358c89e79f3c2a4.png',
    'https://qcdn2.zhaomi.cn/t11de4588164edee72caacc8ad1.png',
    'https://qcdn1.zhaomi.cn/t11de458816b297cc7fbb4413d8.png',
    'https://qcdn1.zhaomi.cn/t11de458816ef59cd1ad9c1193b.png',
    'https://qcdn3.zhaomi.cn/t11de458816b0cc8643dccb4b37.png',
    'https://qcdn1.zhaomi.cn/t11de4588163d4eb1ae4b338b84.png',
    'https://qcdn2.zhaomi.cn/t11de4588165c869f0b3b2f3d9b.png',
  ],
  entry: {
    film: 'https://p0.ssl.qhimg.com/t110b9a93013e585359e0dc8c3f.png',
    seedanceBadge: 'https://p4.ssl.qhimg.com/t110b9a930193b3196d24616a75.png',
    aiVideo: 'https://p3.ssl.qhimg.com/t110b9a9301af8687adaedfc31b.png',
    article: 'https://p4.ssl.qhimg.com/t110b9a93019866419e7a56fd59.png',
    tools: 'https://p4.ssl.qhimg.com/t110b9a930178f66967d5306c18.png',
  },
  works: [
    'https://qcdn2.zhaomi.cn/dr/640__/t11de4588168210049e5caf2be2.webp',
    'https://qcdn4.zhaomi.cn/dr/640__/t11de4588166e6dad0895de2993.webp',
    'https://qcdn2.zhaomi.cn/dr/640__/t11de458816fa37958599acf9bb.webp',
    'https://qcdn1.zhaomi.cn/dr/640__/t11de458816df2a2ffd3f7bf892.webp',
    'https://qcdn5.zhaomi.cn/dr/640__/t11de45881650aef805c3a50f43.webp',
    'https://qcdn5.zhaomi.cn/dr/640__/t11de458816cbf352b2c68b71f1.webp',
    'https://qcdn1.zhaomi.cn/dr/640__/t11de458816306715eb4066ae9b.webp',
    'https://qcdn1.zhaomi.cn/dr/640__/t11de45881636373b36b41282ff.webp',
    'https://qcdn3.zhaomi.cn/dr/640__/t11de45881640234de4e468403e.webp',
    'https://qcdn3.zhaomi.cn/dr/640__/t11de4588169adf2c0e75abd9d0.webp',
    'https://qcdn1.zhaomi.cn/dr/640__/t11de45881657480e16e6359c7a.webp',
    'https://qcdn1.zhaomi.cn/dr/640__/t11de458816c1bc2c8f54e736e7.webp',
  ],
};

async function download(url, dest) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  console.log('ok', path.relative(root, dest), buf.length);
}

const manifest = { logo: {}, banners: [], entry: {}, works: [], icons: {} };

await download(assets.logo, path.join(outDir, 'logo.png'));
manifest.logo.mark = '/nami/logo.png';
await download(assets.favicon, path.join(outDir, 'favicon.svg'));
manifest.logo.favicon = '/nami/favicon.svg';
await download(assets.brandWord, path.join(outDir, 'brand-word.png'));
manifest.logo.word = '/nami/brand-word.png';
await download(assets.vipSpark, path.join(iconDir, 'vip-spark.svg'));
manifest.icons.vipSpark = '/nami/icons/vip-spark.svg';
await download(assets.homeActiveBg, path.join(iconDir, 'home-active-bg.png'));
manifest.icons.homeActiveBg = '/nami/icons/home-active-bg.png';

for (let i = 0; i < assets.banners.length; i++) {
  const name = `banner-${String(i + 1).padStart(2, '0')}.png`;
  await download(assets.banners[i], path.join(bannerDir, name));
  manifest.banners.push(`/nami/banners/${name}`);
}

for (const [key, url] of Object.entries(assets.entry)) {
  const ext = path.extname(new URL(url).pathname) || '.png';
  const name = `${key}${ext}`;
  await download(url, path.join(entryDir, name));
  manifest.entry[key] = `/nami/entry/${name}`;
}

for (let i = 0; i < assets.works.length; i++) {
  const name = `work-${String(i + 1).padStart(2, '0')}.webp`;
  await download(assets.works[i], path.join(worksDir, name));
  manifest.works.push(`/nami/works/${name}`);
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('done', JSON.stringify(manifest, null, 2));
