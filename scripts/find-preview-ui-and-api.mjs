import fs from 'fs';

for (const f of ['tmp-store1.js', 'tmp-video-creator.js', 'tmp-namistory.js', 'tmp-home.js']) {
  const t = fs.readFileSync(f, 'utf8');
  console.log('\n##', f);
  let i = 0;
  let n = 0;
  while ((i = t.indexOf('previewVideo', i)) >= 0 && n < 8) {
    const slice = t.slice(i - 100, i + 500);
    if (/video|cover|img|hover|onMouse|mp4/.test(slice)) {
      console.log('---', i);
      console.log(slice);
    }
    i += 12;
    n++;
  }
}

// try fetch cloud key variants without auth
const keys = [
  'nano_pvideo_generation_settings',
  'nano_pc_pvideo_generation_settings',
  'assistant_pvideo_generation_settings',
];
for (const key of keys) {
  const url = `https://www.namistory.com/api/config/cloud?appsource=so&key=${key}`;
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0',
      referer: 'https://www.namistory.com/',
    },
  });
  const text = await res.text();
  console.log('\nAPI', key, res.status, text.slice(0, 300));
}
