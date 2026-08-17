import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsUrl = 'https://qcdn.zhaomi.cn/assistant/assets/index-DTnFVojr.js';
const cssUrl = 'https://qcdn.zhaomi.cn/assistant/assets/index-Dw0fNaZQ.css';

async function pull(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      referer: 'https://www.namistory.com/',
    },
  });
  const text = await res.text();
  console.log(url, res.status, text.length);
  return text;
}

const js = await pull(jsUrl);
const css = await pull(cssUrl);
fs.writeFileSync(path.join(root, 'tmp-nami-index.js'), js);
fs.writeFileSync(path.join(root, 'tmp-nami-index.css'), css);

const urls = new Set();
const blob = js + '\n' + css;
for (const m of blob.matchAll(/https?:\\\/\\\/[^"'\\\s]+/g)) {
  const u = m[0].replace(/\\\//g, '/').replace(/\\u002F/g, '/');
  if (/\.(png|jpe?g|webp|gif|svg|ico|mp4|webm)(\?|$)/i.test(u) || /qhimg|qhres|zhaomi|cos|oss|cdn/i.test(u)) {
    urls.add(u.replace(/\\+$/, ''));
  }
}
for (const m of blob.matchAll(/https?:\/\/[^"'\\\s)]+/g)) {
  const u = m[0];
  if (/\.(png|jpe?g|webp|gif|svg|ico|mp4|webm)(\?|$)/i.test(u) || /qhimg|qhres|zhaomi/i.test(u)) {
    urls.add(u.replace(/[,;).]+$/, ''));
  }
}
for (const m of blob.matchAll(/["'](\/assistant\/[^"']+\.(?:png|jpe?g|webp|gif|svg|mp4))["']/g)) {
  urls.add('https://qcdn.zhaomi.cn' + m[1]);
}
for (const m of blob.matchAll(/["'](https?:[^"']+\.(?:png|jpe?g|webp|gif|svg|mp4)[^"']*)["']/g)) {
  urls.add(m[1]);
}

const list = [...urls].sort();
fs.writeFileSync(path.join(root, 'tmp-nami-urls.txt'), list.join('\n'));
console.log('found', list.length);
console.log(list.slice(0, 120).join('\n'));
