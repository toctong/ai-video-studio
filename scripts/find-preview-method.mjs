import fs from 'fs';

const t = fs.readFileSync('tmp-namistory.js', 'utf8');
// Find object methods for loadPreviewConfig / getPreviewConfig
const patterns = [
  'loadPreviewConfig:',
  'loadPreviewConfig=',
  'getPreviewConfig:',
  'getPreviewConfig=',
  'async loadPreviewConfig',
  'loadPreviewConfig(){',
  'getPreviewConfig(e)',
  'getPreviewConfig(t)',
  'previewConfigMap',
  'preview_list',
];

for (const p of patterns) {
  const i = t.indexOf(p);
  console.log(p, i);
  if (i >= 0) console.log(t.slice(i, i + 900), '\n====\n');
}

// Also search store files referenced - look for assistant_pc_video or similar cloud keys in namistory
for (const kw of [
  'assistant_pc_pvideo',
  'nano_pc_pvideo_creation',
  'creation_mode_preview',
  'mode_preview',
  'preview_video',
  'previewVideo',
]) {
  let i = 0;
  let n = 0;
  while ((i = t.indexOf(kw, i)) >= 0 && n < 3) {
    console.log('KW', kw, i);
    console.log(t.slice(i - 80, i + 500));
    console.log('----');
    i += kw.length;
    n++;
  }
}

// Extract options array with labels for creation modes
const j = t.indexOf('ImageToVideo');
console.log('\nImageToVideo context', t.slice(j - 200, j + 1500));
