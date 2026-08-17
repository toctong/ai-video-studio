import fs from 'fs';

const t = fs.readFileSync('tmp-home.js', 'utf8');
const re = /图生视频[\s\S]{0,1200}/g;
let m;
let n = 0;
while ((m = re.exec(t)) && n < 8) {
  console.log('--- hit', n, '---');
  console.log(m[0]);
  n++;
}

// find definition of getPreviewConfig method body
const idx = t.indexOf('getPreviewConfig(');
console.log('\nidx', idx);
console.log(t.slice(Math.max(0, idx - 1500), idx + 200));

// search for video urls with chinese labels nearby
const media = [...t.matchAll(/https?:\\\/\\\/[^"'\\]+?\.(?:mp4|webm|webp|png|jpe?g)/g)].map((x) =>
  x[0].replace(/\\\//g, '/'),
);
console.log('\nescaped media', media);
const media2 = [...t.matchAll(/https?:\/\/[^"'\\\s)]+\.(?:mp4|webm)/g)].map((x) => x[0]);
console.log('raw mp4', media2);

// look for Preview in variable names
for (const kw of ['previewVideo', 'previewImage', 'coverImage', 'hoverVideo', 'demoVideo']) {
  const i = t.indexOf(kw);
  if (i >= 0) console.log(kw, 'at', i, t.slice(i, i + 300));
}
