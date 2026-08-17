import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outHtml = path.join(root, 'tmp-nami-home.html');

const res = await fetch('https://www.namistory.com/', {
  headers: {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  },
});
const html = await res.text();
fs.writeFileSync(outHtml, html);
console.log('status', res.status, 'len', html.length);

const urls = new Set();
for (const m of html.matchAll(/https?:\/\/[^"'\\\s>]+\.(?:png|jpe?g|webp|svg|gif|ico)(?:\?[^"'\\\s>]*)?/gi)) {
  urls.add(m[0]);
}
for (const m of html.matchAll(/\/(?:assets|static|cdn)[^"'\\\s>]+\.(?:js|css)/gi)) {
  urls.add(m[0]);
}
for (const m of html.matchAll(/src=["']([^"']+)["']/gi)) {
  urls.add(m[1]);
}
for (const m of html.matchAll(/href=["']([^"']+\.(?:js|css))["']/gi)) {
  urls.add(m[1]);
}
console.log([...urls].slice(0, 80).join('\n'));
console.log('--- head ---');
console.log(html.slice(0, 800));
