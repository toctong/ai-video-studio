import fs from 'fs';

const t = fs.readFileSync('tmp-store1.js', 'utf8');
console.log('len', t.length);

for (const kw of [
  'loadPreviewConfig',
  'getPreviewConfig',
  'previewConfig',
  '图生视频',
  '宫格生视频',
  '多参生视频',
  '.mp4',
  'ns.chat',
  'qhimg',
]) {
  let i = 0;
  let n = 0;
  while ((i = t.indexOf(kw, i)) >= 0 && n < 5) {
    console.log('\n====', kw, i, '====');
    console.log(t.slice(Math.max(0, i - 120), i + 900));
    i += kw.length;
    n++;
  }
}
