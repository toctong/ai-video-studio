import fs from 'fs';

const t = fs.readFileSync('tmp-video-creator.js', 'utf8');
const idx = t.indexOf('getPreviewConfig');
console.log('first at', idx);
console.log(t.slice(Math.max(0, idx - 2500), idx + 800));

// find class/object that defines getPreviewConfig
let i = 0;
let n = 0;
while ((i = t.indexOf('getPreviewConfig', i)) >= 0 && n < 6) {
  console.log('\n==== occurrence', n, 'at', i, '====');
  console.log(t.slice(i, i + 600));
  i += 16;
  n++;
}

// search for video:http near chinese
for (const kw of ['宫格生视频', '多参生视频', '图生视频', 'HappyHorse']) {
  const j = t.indexOf(kw);
  if (j < 0) continue;
  console.log('\nKW', kw);
  console.log(t.slice(j - 300, j + 900));
}
