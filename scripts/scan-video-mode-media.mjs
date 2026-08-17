import fs from 'fs';

const files = [
  'tmp-video-creator.js',
  'tmp-namistory.js',
  'tmp-constant.js',
  'tmp-home.js',
  'tmp-asset-index-DTnFVojr.js',
];

const needles = [
  'getPreviewConfig',
  'previewConfig',
  '宫格生视频',
  '多参生视频',
  '图生视频',
  '全能参考',
  'creationMode',
  'MultiParamVideo',
  'ImageToVideo',
  'GridVideo',
];

for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const t = fs.readFileSync(f, 'utf8');
  console.log('\n####', f, t.length);
  for (const kw of needles) {
    const c = t.split(kw).length - 1;
    if (c) console.log(kw, c);
  }
  const mp4s = [...t.matchAll(/https?:\/\/[^"'\\\s)]+\.mp4[^"'\\\s)]*/g)].map((m) =>
    m[0].replace(/[,);]+$/, ''),
  );
  const unique = [...new Set(mp4s)];
  if (unique.length) {
    console.log('mp4 count', unique.length);
    console.log(unique.slice(0, 40).join('\n'));
  }
  // also escaped
  const mp4e = [...t.matchAll(/https?:\\\/\\\/[^"'\\]+?\.mp4/g)].map((m) => m[0].replace(/\\\//g, '/'));
  if (mp4e.length) console.log('escaped mp4', [...new Set(mp4e)].slice(0, 20));
}
