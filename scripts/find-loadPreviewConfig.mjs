import fs from 'fs';

for (const f of ['tmp-video-creator.js', 'tmp-namistory.js', 'tmp-asset-index-DTnFVojr.js', 'tmp-home.js']) {
  const t = fs.readFileSync(f, 'utf8');
  const keys = ['loadPreviewConfig', 'preview_config', 'previewConfig', 'nano_pc_pvideo', 'creation_mode'];
  console.log('\n##', f);
  for (const k of keys) {
    let i = 0;
    let n = 0;
    while ((i = t.indexOf(k, i)) >= 0 && n < 4) {
      const slice = t.slice(i, i + 700);
      if (n === 0 || /http|mp4|video|cover|image|qhimg|zhaomi/.test(slice)) {
        console.log('---', k, i);
        console.log(slice);
      }
      i += k.length;
      n++;
    }
  }
}
