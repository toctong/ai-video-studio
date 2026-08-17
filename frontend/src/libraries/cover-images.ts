import type { LibraryKind } from './types';

function hueOf(seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(n) % 360;
}

function hashStr(s: string) {
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(n);
}

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function svgUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** 角色库：本地竖版人像卡（不依赖外网） */
function coverCharacter(category: string, seedKey = '') {
  const n = hashStr(`${category}:${seedKey}`);
  const h = hueOf(`char:${category}:${seedKey}`);
  const h2 = (h + 48) % 360;
  const skin = `hsl(${30 + (n % 20)} ${35 + (n % 20)}% ${72 + (n % 10)}%)`;
  const hair = `hsl(${h} 35% ${18 + (n % 20)}%)`;
  const cloth = `hsl(${h2} 45% ${40 + (n % 15)}%)`;
  const cat = esc(category.slice(0, 6));
  const offset = (n % 30) - 15;
  const isSheet = seedKey.includes('sheet');
  const isExpr = seedKey.includes('expr');
  const faces = isExpr
    ? `
      <g transform="translate(40 80)">
        ${[0, 1, 2]
          .flatMap((row) =>
            [0, 1, 2].map((col) => {
              const x = col * 140;
              const y = row * 160;
              return `<g transform="translate(${x} ${y})">
                <circle cx="50" cy="48" r="36" fill="${skin}"/>
                <ellipse cx="50" cy="28" rx="38" ry="22" fill="${hair}"/>
                <circle cx="38" cy="48" r="3" fill="#222"/><circle cx="62" cy="48" r="3" fill="#222"/>
                <path d="M40 62 Q50 ${58 + ((row + col) % 3) * 4} 60 62" fill="none" stroke="#222" stroke-width="2"/>
              </g>`;
            }),
          )
          .join('')}
      </g>`
    : isSheet
      ? `
      <g transform="translate(40 120)">
        <ellipse cx="70" cy="60" rx="40" ry="48" fill="${skin}"/>
        <ellipse cx="70" cy="30" rx="44" ry="28" fill="${hair}"/>
        <path d="M40 120 Q70 200 100 120" fill="${cloth}"/>
        <ellipse cx="200" cy="70" rx="34" ry="44" fill="${skin}"/>
        <ellipse cx="200" cy="42" rx="38" ry="24" fill="${hair}"/>
        <path d="M175 125 Q200 195 225 125" fill="${cloth}"/>
        <ellipse cx="330" cy="70" rx="34" ry="44" fill="${skin}"/>
        <ellipse cx="330" cy="42" rx="38" ry="24" fill="${hair}"/>
        <path d="M305 125 Q330 195 355 125" fill="${cloth}"/>
      </g>`
      : `
      <g transform="translate(${120 + offset} 90)">
        <ellipse cx="120" cy="110" rx="78" ry="92" fill="${skin}"/>
        <path d="M40 70 C60 10 180 10 200 70 C210 110 200 150 190 170 L50 170 C40 140 30 110 40 70Z" fill="${hair}"/>
        <circle cx="90" cy="120" r="6" fill="#222"/><circle cx="150" cy="120" r="6" fill="#222"/>
        <path d="M100 150 Q120 162 140 150" fill="none" stroke="#222" stroke-width="3" stroke-linecap="round"/>
        <path d="M40 210 Q120 380 200 210" fill="${cloth}"/>
      </g>`;
  return svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640" viewBox="0 0 480 640">
  <defs>
    <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="hsl(${h} 40% 28%)"/>
      <stop offset="100%" stop-color="hsl(${h2} 30% 10%)"/>
    </linearGradient>
  </defs>
  <rect width="480" height="640" fill="url(#cg)"/>
  ${faces}
  <text x="24" y="600" fill="#fff" font-size="14" font-family="system-ui,sans-serif" opacity="0.55">${cat}</text>
</svg>`);
}

/** 风格广场：纯抽象色块封面（标题在卡片 meta，避免图上叠字） */
function coverStylePlaza(category: string, label = '') {
  const h = hueOf(`style:${category}:${label}`);
  const h2 = (h + 56) % 360;
  const h3 = (h + 140) % 360;
  const n = hashStr(category + label);
  const blobs = [
    `<ellipse cx="${180 + (n % 80)}" cy="${220 + (n % 40)}" rx="180" ry="220" fill="hsl(${h} 70% 55% / 0.55)"/>`,
    `<ellipse cx="${480 - (n % 60)}" cy="${160 + (n % 50)}" rx="160" ry="200" fill="hsl(${h2} 65% 50% / 0.45)"/>`,
    `<circle cx="${360}" cy="${340}" r="${90 + (n % 40)}" fill="hsl(${h3} 60% 48% / 0.35)"/>`,
  ].join('');
  return svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640" viewBox="0 0 480 640">
  <defs>
    <linearGradient id="sg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${h} 42% 22%)"/>
      <stop offset="55%" stop-color="hsl(${h2} 38% 12%)"/>
      <stop offset="100%" stop-color="hsl(${h} 28% 6%)"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="35%" r="55%">
      <stop offset="0%" stop-color="hsl(${h} 80% 60% / 0.45)"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
  </defs>
  <rect width="480" height="640" fill="url(#sg)"/>
  <rect width="480" height="640" fill="url(#glow)"/>
  <g>${blobs}</g>
  <path d="M0 420 C120 380 180 520 300 480 S420 360 480 400 L480 640 L0 640 Z" fill="#000" opacity="0.22"/>
</svg>`);
}

/** 镜头库实拍/定妆参考封面（public/library-covers/shot） */
const SHOT_COVER_BY_CATEGORY: Record<string, string> = {
  国风东方: '/library-covers/shot/guofeng-east.jpg',
  二次元动漫: '/library-covers/shot/anime-2d.jpg',
  传统美术绘画: '/library-covers/shot/traditional-art.png',
};

/** 子风格（tags[0]）优先于画风族 */
const SHOT_COVER_BY_SUBSTYLE: Array<{ test: (tag: string) => boolean; url: string }> = [
  { test: (t) => t === '炎彩' || t === '岩彩', url: '/library-covers/shot/yancai-flame.png' },
  { test: (t) => t === '赛璐璐' || t === '日系动画', url: '/library-covers/shot/cel-shading.png' },
];

function shotSubStyleOf(item?: { tags?: string[]; blurb?: string; label?: string }) {
  const tags = Array.isArray(item?.tags) ? item!.tags! : [];
  const fromTag = tags.find((t) => t && t !== '画风' && t !== '动漫风');
  if (fromTag) return String(fromTag).trim();
  const blurb = String(item?.blurb || '');
  const m = blurb.match(/^[^\n·]+·([^\n：:]+)/);
  return m ? String(m[1] || '').trim() : '';
}

function resolveShotCoverUrl(
  category: string,
  item?: { tags?: string[]; blurb?: string; label?: string },
): string {
  const sub = shotSubStyleOf(item);
  if (sub) {
    const hit = SHOT_COVER_BY_SUBSTYLE.find((x) => x.test(sub));
    if (hit) return hit.url;
  }
  const byCat = SHOT_COVER_BY_CATEGORY[String(category || '').trim()];
  if (byCat) return byCat;
  return '';
}

/** 特效/镜头广场：电影感竖卡（无实图时的 SVG 兜底；标题在卡片 meta） */
function coverShotPlaza(category: string, label = '') {
  const h = hueOf(`shot:${category}:${label}`);
  const h2 = (h + 40) % 360;
  const n = hashStr(label + category);
  return svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640" viewBox="0 0 480 640">
  <defs>
    <linearGradient id="vg" x1="0.2" y1="0" x2="0.9" y2="1">
      <stop offset="0%" stop-color="hsl(${h} 55% 18%)"/>
      <stop offset="100%" stop-color="hsl(${h2} 40% 6%)"/>
    </linearGradient>
  </defs>
  <rect width="480" height="640" fill="url(#vg)"/>
  <rect x="24" y="28" width="432" height="460" rx="18" fill="#fff" opacity="0.06" stroke="#fff" stroke-opacity="0.18"/>
  <circle cx="${200 + (n % 40)}" cy="${200 + (n % 30)}" r="70" fill="hsl(${h} 80% 58% / 0.55)"/>
  <path d="M140 340 L240 180 L340 340 Z" fill="hsl(${h2} 70% 55% / 0.35)"/>
  <path d="M80 420 C160 300 280 460 400 280" fill="none" stroke="#fff" stroke-width="6" opacity="0.35" stroke-linecap="round"/>
  <circle cx="400" cy="280" r="10" fill="#fff" opacity="0.8"/>
</svg>`);
}

function coverCardArt(opts: {
  category: string;
  kindLabel: string;
  motif: 'hook' | 'hex' | 'wave' | 'frames' | 'title';
}) {
  const h = hueOf(opts.category + opts.kindLabel);
  const h2 = (h + 48) % 360;
  const cat = esc(opts.category);
  const kind = esc(opts.kindLabel);
  const motifs: Record<string, string> = {
    hook: `
      <path d="M80 300 C160 300 180 140 280 140 C380 140 400 320 500 320 C600 320 620 200 680 160"
        fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity="0.85"/>
      <circle cx="680" cy="160" r="18" fill="hsl(${h} 80% 65%)"/>
      <circle cx="280" cy="140" r="12" fill="#fff" opacity="0.9"/>
    `,
    hex: `
      <g fill="none" stroke="#fff" stroke-width="2.2" opacity="0.7" transform="translate(360 230)">
        <polygon points="0,-110 95,-55 95,55 0,110 -95,55 -95,-55"/>
        <polygon points="0,-70 60,-35 60,35 0,70 -60,35 -60,-35"/>
        <circle cx="0" cy="0" r="8" fill="hsl(${h} 70% 60%)" stroke="none"/>
      </g>
    `,
    wave: `
      <path d="M40 260 C120 260 140 120 230 120 S340 340 430 340 540 160 620 160 700 280 720 280"
        fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity="0.9"/>
    `,
    frames: `
      <rect x="60" y="90" width="280" height="150" rx="14" fill="#fff" opacity="0.12" stroke="#fff" stroke-width="1.5"/>
      <rect x="380" y="90" width="280" height="150" rx="14" fill="#fff" opacity="0.08" stroke="#fff" stroke-width="1.5"/>
    `,
    title: `
      <rect x="110" y="130" width="500" height="180" rx="18" fill="#fff" opacity="0.1" stroke="#fff" stroke-width="1.5"/>
      <text x="360" y="220" text-anchor="middle" fill="#fff" font-size="52" font-family="Georgia,serif" font-weight="700" letter-spacing="6">书名</text>
      <text x="360" y="270" text-anchor="middle" fill="#fff" font-size="16" opacity="0.55">${cat}</text>
    `,
  };
  return svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="450" viewBox="0 0 720 450">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${h} 48% 28%)"/>
      <stop offset="100%" stop-color="hsl(${h2} 30% 10%)"/>
    </linearGradient>
  </defs>
  <rect width="720" height="450" fill="url(#bg)"/>
  ${motifs[opts.motif]}
  <text x="40" y="48" fill="#fff" font-size="15" font-family="system-ui,sans-serif" font-weight="650">${cat}</text>
  <text x="40" y="418" fill="#fff" font-size="13" font-family="system-ui,sans-serif" opacity="0.5">${kind}</text>
</svg>`);
}

/** 灵感库：小说封面风（按题材配色与装饰） */
function coverScript(category: string) {
  const h = hueOf(`script:${category}`);
  const themes: Record<string, { h: number; badge: string; deco: string }> = {
    都市爽文: { h: 210, badge: '都市', deco: 'city' },
    玄幻修仙: { h: 265, badge: '玄幻', deco: 'peak' },
    甜宠言情: { h: 340, badge: '甜宠', deco: 'heart' },
    悬疑脑洞: { h: 220, badge: '悬疑', deco: 'fog' },
    古风权谋: { h: 28, badge: '古风', deco: 'fan' },
    沙雕搞笑: { h: 45, badge: '搞笑', deco: 'star' },
    搞笑修仙: { h: 55, badge: '搞笑', deco: 'star' },
    搞笑都市: { h: 48, badge: '搞笑', deco: 'star' },
    霸道甜宠: { h: 350, badge: '甜宠', deco: 'heart' },
    腹黑权谋: { h: 0, badge: '权谋', deco: 'fan' },
    系统流: { h: 190, badge: '系统', deco: 'grid' },
    穿越重生: { h: 280, badge: '穿越', deco: 'clock' },
    末世求生: { h: 15, badge: '末世', deco: 'fog' },
    诸天无限: { h: 250, badge: '诸天', deco: 'grid' },
    种田基建: { h: 110, badge: '种田', deco: 'peak' },
    规则怪谈: { h: 270, badge: '怪谈', deco: 'fog' },
    都市战神: { h: 205, badge: '战神', deco: 'city' },
    电竞文娱: { h: 300, badge: '电竞', deco: 'grid' },
    校园青春: { h: 160, badge: '校园', deco: 'heart' },
    历史穿越: { h: 32, badge: '历史', deco: 'fan' },
    科幻赛博: { h: 185, badge: '科幻', deco: 'grid' },
    武侠江湖: { h: 140, badge: '武侠', deco: 'peak' },
    病娇暗恋: { h: 320, badge: '暗恋', deco: 'heart' },
    爽文打脸: { h: 12, badge: '爽文', deco: 'city' },
    变异文: { h: 95, badge: '变异', deco: 'fog' },
    宫斗宅斗: { h: 0, badge: '宫斗', deco: 'fan' },
    娱乐圈: { h: 320, badge: '娱乐', deco: 'star' },
    无限流: { h: 245, badge: '无限', deco: 'grid' },
  };
  const t = themes[category] || { h, badge: category.slice(0, 2), deco: 'star' };
  const hh = t.h;
  const cat = esc(category);

  const decoMap: Record<string, string> = {
    city: `
      <rect x="480" y="220" width="28" height="140" fill="#fff" opacity="0.12"/>
      <rect x="520" y="180" width="36" height="180" fill="#fff" opacity="0.1"/>
      <rect x="568" y="240" width="24" height="120" fill="#fff" opacity="0.14"/>
      <rect x="604" y="200" width="40" height="160" fill="#fff" opacity="0.08"/>
    `,
    peak: `
      <path d="M400 380 L520 160 L640 380 Z" fill="#fff" opacity="0.1"/>
      <path d="M460 380 L580 200 L700 380 Z" fill="#fff" opacity="0.07"/>
    `,
    heart: `
      <path d="M560 220 C560 190 600 190 600 220 C600 190 640 190 640 220 C640 270 600 310 600 310 C600 310 560 270 560 220 Z"
        fill="#fff" opacity="0.14"/>
    `,
    fog: `
      <ellipse cx="560" cy="260" rx="140" ry="50" fill="#fff" opacity="0.08"/>
      <ellipse cx="500" cy="300" rx="160" ry="40" fill="#fff" opacity="0.06"/>
    `,
    fan: `
      <path d="M520 300 Q600 160 680 300" fill="none" stroke="#fff" stroke-width="3" opacity="0.2"/>
      <path d="M530 300 Q600 190 670 300" fill="none" stroke="#fff" stroke-width="2" opacity="0.15"/>
      <path d="M540 300 Q600 220 660 300" fill="none" stroke="#fff" stroke-width="2" opacity="0.12"/>
    `,
    star: `
      <polygon points="580,180 592,215 630,215 600,238 612,275 580,252 548,275 560,238 530,215 568,215" fill="#fff" opacity="0.16"/>
    `,
    grid: `
      <g stroke="#fff" stroke-width="1.2" opacity="0.15">
        <rect x="480" y="180" width="160" height="160" rx="8" fill="none"/>
        <line x1="533" y1="180" x2="533" y2="340"/><line x1="586" y1="180" x2="586" y2="340"/>
        <line x1="480" y1="233" x2="640" y2="233"/><line x1="480" y1="286" x2="640" y2="286"/>
      </g>
    `,
    clock: `
      <circle cx="580" cy="250" r="70" fill="none" stroke="#fff" stroke-width="3" opacity="0.18"/>
      <line x1="580" y1="250" x2="580" y2="200" stroke="#fff" stroke-width="3" opacity="0.25"/>
      <line x1="580" y1="250" x2="620" y2="270" stroke="#fff" stroke-width="2.5" opacity="0.2"/>
    `,
  };

  return svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="450" viewBox="0 0 720 450">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0.85" y2="1">
      <stop offset="0%" stop-color="hsl(${hh} 52% 32%)"/>
      <stop offset="55%" stop-color="hsl(${(hh + 18) % 360} 42% 18%)"/>
      <stop offset="100%" stop-color="hsl(${hh} 30% 8%)"/>
    </linearGradient>
    <linearGradient id="spine" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="hsl(${hh} 45% 18%)"/>
      <stop offset="100%" stop-color="hsl(${hh} 40% 28%)"/>
    </linearGradient>
  </defs>
  <rect width="720" height="450" fill="url(#g)"/>
  <rect x="0" y="0" width="36" height="450" fill="url(#spine)"/>
  <rect x="36" y="0" width="3" height="450" fill="#fff" opacity="0.12"/>
  ${decoMap[t.deco] || decoMap.star}
  <text x="72" y="78" fill="#fff" font-size="13" font-family="system-ui,sans-serif" letter-spacing="4" opacity="0.55">STORY · 灵感</text>
  <text x="72" y="150" fill="#fff" font-size="36" font-family="system-ui,sans-serif" font-weight="800" letter-spacing="1">${cat}</text>
  <rect x="72" y="175" width="64" height="4" rx="2" fill="hsl(${hh} 70% 62%)"/>
  <text x="72" y="230" fill="#fff" font-size="14" font-family="system-ui,sans-serif" opacity="0.55" letter-spacing="2">${esc(t.badge)}题材骨架</text>
  <text x="72" y="400" fill="#fff" font-size="12" font-family="system-ui,sans-serif" opacity="0.35">AIGC 视频工厂 · Library</text>
</svg>`);
}

/** 台词库：对白卡片（引号 + 气氛文案） */
function coverDialogue(category: string) {
  const presets: Record<string, { h: number; line1: string; line2: string; tone: string }> = {
    对峙质问: { h: 355, line1: '你凭什么', line2: '站在这里质问我？', tone: '对峙' },
    告白心动: { h: 340, line1: '我喜欢你', line2: '不是今天才开始。', tone: '告白' },
    吐槽幽默: { h: 42, line1: '行吧，这剧情', line2: '我先笑为敬。', tone: '吐槽' },
    决断宣言: { h: 28, line1: '从今天起', line2: '我自己定规矩。', tone: '宣言' },
    旁白内心: { h: 255, line1: '他以为没人懂', line2: '其实我全都听见了。', tone: '内心' },
    商战交锋: { h: 210, line1: '估值我来说', line2: '你只负责签字。', tone: '商战' },
    修仙对白: { h: 265, line1: '你的道太吵', line2: '剑比你诚实。', tone: '修仙' },
    甜宠私语: { h: 345, line1: '别躲我伞下', line2: '人暂时也是我的。', tone: '甜宠' },
    悬疑低压: { h: 220, line1: '别数脚步', line2: '数到十三会少一双鞋。', tone: '悬疑' },
    打脸宣言: { h: 8, line1: '刚才谁笑', line2: '现在轮到你们沉默。', tone: '打脸' },
    系统提示: { h: 190, line1: '【叮】任务发布', line2: '倒计时结束前活下去。', tone: '系统' },
    末世求生: { h: 15, line1: '门别开', line2: '外面可能是昨天的队友。', tone: '末世' },
    宫斗试探: { h: 28, line1: '这茶如何', line2: '还稳得住手吗？', tone: '宫斗' },
    电竞指挥: { h: 300, line1: '跟我打', line2: '还有一局够写历史。', tone: '电竞' },
    反派独白: { h: 0, line1: '我教过你', line2: '每一步都盖着我的章。', tone: '反派' },
  };
  const p = presets[category] || {
    h: hueOf(category),
    line1: category,
    line2: '一句就能立住场面。',
    tone: '台词',
  };
  const hh = p.h;

  return svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="450" viewBox="0 0 720 450">
  <defs>
    <linearGradient id="dg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hh} 35% 16%)"/>
      <stop offset="100%" stop-color="hsl(${(hh + 30) % 360} 28% 8%)"/>
    </linearGradient>
  </defs>
  <rect width="720" height="450" fill="url(#dg)"/>
  <circle cx="620" cy="80" r="140" fill="hsl(${hh} 55% 45% / 0.18)"/>
  <circle cx="80" cy="400" r="120" fill="hsl(${(hh + 40) % 360} 50% 40% / 0.12)"/>
  <text x="64" y="120" fill="hsl(${hh} 60% 65%)" font-size="96" font-family="Georgia,serif" opacity="0.35">“</text>
  <text x="96" y="210" fill="#fff" font-size="34" font-family="system-ui,sans-serif" font-weight="750">${esc(p.line1)}</text>
  <text x="96" y="262" fill="#fff" font-size="34" font-family="system-ui,sans-serif" font-weight="750" opacity="0.92">${esc(p.line2)}</text>
  <rect x="96" y="290" width="48" height="3" rx="1.5" fill="hsl(${hh} 65% 58%)"/>
  <text x="96" y="340" fill="#fff" font-size="14" font-family="system-ui,sans-serif" opacity="0.45">${esc(category)} · ${esc(p.tone)}对白</text>
  <text x="96" y="410" fill="#fff" font-size="12" font-family="system-ui,sans-serif" opacity="0.3">台词库</text>
</svg>`);
}

/** 桥段库：情节分镜卡（三拍叙事） */
function coverTrope(category: string) {
  const presets: Record<string, { h: number; a: string; b: string; c: string }> = {
    打脸翻盘: { h: 8, a: '轻视', b: '证据', c: '翻盘' },
    身份反转: { h: 265, a: '伪装', b: '破绽', c: '揭晓' },
    情感羁绊: { h: 340, a: '靠近', b: '试探', c: '确认' },
    危机悬念: { h: 220, a: '平静', b: '异变', c: '坠落' },
    成长冒险: { h: 150, a: '出发', b: '试炼', c: '归来' },
    商战博弈: { h: 205, a: '让步', b: '锁死', c: '吞并' },
    校园修罗: { h: 160, a: '嘲讽', b: '对决', c: '封神' },
    修仙秘境: { h: 280, a: '入局', b: '背刺', c: '认主' },
    甜宠误会: { h: 350, a: '误会', b: '靠近', c: '戳破' },
    重生复仇: { h: 355, a: '睁眼', b: '名单', c: '清算' },
    退婚打脸: { h: 10, a: '退婚', b: '证据', c: '砸场' },
    系统任务: { h: 185, a: '弹窗', b: '执行', c: '奖励' },
    末世据点: { h: 18, a: '立规', b: '围城', c: '突围' },
    宫斗权谋: { h: 0, a: '赐茶', b: '密诏', c: '夺印' },
    电竞翻盘: { h: 295, a: '落后', b: '调整', c: '让二追三' },
  };
  const p = presets[category] || {
    h: hueOf(category),
    a: '起',
    b: '承',
    c: '转',
  };
  const hh = p.h;
  const cat = esc(category);

  return svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="450" viewBox="0 0 720 450">
  <defs>
    <linearGradient id="tg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hh} 40% 18%)"/>
      <stop offset="100%" stop-color="hsl(${(hh + 25) % 360} 32% 8%)"/>
    </linearGradient>
  </defs>
  <rect width="720" height="450" fill="url(#tg)"/>
  <text x="40" y="48" fill="#fff" font-size="13" font-family="system-ui,sans-serif" letter-spacing="3" opacity="0.5">BEAT · 桥段</text>
  <text x="40" y="88" fill="#fff" font-size="26" font-family="system-ui,sans-serif" font-weight="800">${cat}</text>

  <g font-family="system-ui,sans-serif" font-weight="700" font-size="18" fill="#fff">
    <rect x="40" y="130" width="200" height="240" rx="16" fill="#fff" opacity="0.08" stroke="#fff" stroke-width="1.2" stroke-opacity="0.25"/>
    <text x="140" y="250" text-anchor="middle" opacity="0.9">${esc(p.a)}</text>
    <text x="140" y="280" text-anchor="middle" font-size="12" font-weight="500" opacity="0.4">第一拍</text>

    <rect x="260" y="130" width="200" height="240" rx="16" fill="#fff" opacity="0.11" stroke="#fff" stroke-width="1.2" stroke-opacity="0.3"/>
    <text x="360" y="250" text-anchor="middle" opacity="0.95">${esc(p.b)}</text>
    <text x="360" y="280" text-anchor="middle" font-size="12" font-weight="500" opacity="0.4">第二拍</text>
    <circle cx="360" cy="200" r="22" fill="hsl(${hh} 65% 55%)" opacity="0.85"/>
    <text x="360" y="206" text-anchor="middle" font-size="14" fill="#111" opacity="0.9">2</text>

    <rect x="480" y="130" width="200" height="240" rx="16" fill="hsl(${hh} 55% 42% / 0.35)" stroke="hsl(${hh} 70% 60%)" stroke-width="1.5"/>
    <text x="580" y="250" text-anchor="middle">${esc(p.c)}</text>
    <text x="580" y="280" text-anchor="middle" font-size="12" font-weight="500" opacity="0.55">落点</text>
  </g>

  <path d="M240 250 L260 250" stroke="#fff" stroke-width="2" opacity="0.35" stroke-linecap="round"/>
  <path d="M460 250 L480 250" stroke="#fff" stroke-width="2" opacity="0.35" stroke-linecap="round"/>
  <text x="40" y="420" fill="#fff" font-size="12" font-family="system-ui,sans-serif" opacity="0.35">桥段库 · 三拍叙事</text>
</svg>`);
}

/**
 * 按资源库类型 + 分类取封面。
 * 同一分类共用一张；不同类型画面语言不同且尽量贴合用途。
 */
export function libraryCoverByCategory(category: string, kind: LibraryKind = 'script') {
  const cat = String(category || '未分类').trim() || '未分类';

  switch (kind) {
    case 'character':
      return coverCharacter(cat);
    case 'style':
      return coverStylePlaza(cat);
    case 'script':
      return coverScript(cat);
    case 'dialogue':
      return coverDialogue(cat);
    case 'hook':
      return coverCardArt({ category: cat, kindLabel: '悬念钩子', motif: 'hook' });
    case 'lore':
      return coverCardArt({ category: cat, kindLabel: '世界观设定', motif: 'hex' });
    case 'pacing':
      return coverCardArt({ category: cat, kindLabel: '叙事节奏', motif: 'wave' });
    case 'trope':
      return coverTrope(cat);
    case 'title':
      return coverCardArt({ category: cat, kindLabel: '书名简介', motif: 'title' });
    case 'skill':
      return coverCardArt({ category: cat, kindLabel: '命名技能', motif: 'frames' });
    case 'shot': {
      const real = resolveShotCoverUrl(cat);
      return real || coverShotPlaza(cat);
    }
    default:
      return coverCardArt({ category: cat, kindLabel: '资源', motif: 'frames' });
  }
}

/** 条目级封面：镜头库优先用实图参考封面，其余本地 SVG */
export function libraryCoverForItem(
  item: { id: string; category: string; label?: string; tags?: string[]; blurb?: string },
  kind: LibraryKind,
  variant: 'main' | 'full' | 'bust' | 'expr' | 'sheet' = 'main',
) {
  const cat = String(item.category || '未分类').trim() || '未分类';
  const label = String(item.label || '');
  if (kind === 'character') {
    const seed = `${item.id}:${variant}`;
    return coverCharacter(cat, seed);
  }
  if (kind === 'style') return coverStylePlaza(cat, `${label}:${item.id}`);
  if (kind === 'shot') {
    const real = resolveShotCoverUrl(cat, item);
    return real || coverShotPlaza(cat, `${label}:${item.id}`);
  }
  return libraryCoverByCategory(cat, kind);
}

/** @deprecated */
export function libraryCoverUrl(category: string, kind: string = 'script') {
  return libraryCoverByCategory(category, kind as LibraryKind);
}
