import { scriptCats as legacyScriptCats } from './_scriptCats_extract.mjs';
import { extraScriptCats } from './extra-script-cats.mjs';

const HOOKS = ['当夜', '48小时内', '72小时倒计时', '暴雨夜', '凌晨三点', '破晓前', '签字前', '熔断前', '末班车前', '发布会前'];
const SCENES = ['直播', '庭上', '发布会', '谈判桌', '董事会', '机房', '天台', '仓库', '地铁', '校门口'];
const TWISTS = ['内鬼反水', '证据被调包', '盟友临阵退缩', '舆论反转', '规则突改', '旧伤复发', '第三方插足', '资金断链', '身份被扒', '时间不够'];

function idea(cat, role, conflict, foe, tone) {
  return `题材定位：${cat}，竖屏短漫/短剧。主角身份：${role}。核心冲突：${conflict}。对手/阻力：${foe}。叙事基调：${tone}。单集1–2分钟，结尾强悬念，适合快剪对白与特写。`;
}

const TONE = {
  '都市爽文': '打脸逆袭、商战智斗',
  '玄幻修仙': '热血升级、宗门争锋',
  '甜宠言情': '高甜治愈、误会往返',
  '悬疑脑洞': '烧脑反转、细思极恐',
  '古风权谋': '步步为营、身份暗涌',
  '末日求生': '生存压迫、人性抉择',
  '科幻机甲': '硬科幻动作、阵营博弈',
  '武侠江湖': '快意恩仇、侠义拷问',
  '校园青春': '成长共鸣、青春群像',
  '职场逆袭': '规则碾压、能力正名',
};

function meta(cat, core) {
  const role = (core.split(/[，,]/)[0] || core).trim();
  return {
    role,
    conflict: core.replace(/。$/u, ''),
    foe: '利益集团、规则壁垒与舆论场的联合围剿',
    tone: TONE[cat] || '强情节、快反转',
  };
}

function beats(cat, idx, label, blurb, core) {
  const parts = core.split(/[，,]/).map((s) => s.trim()).filter(Boolean);
  const p0 = parts[0] || core.slice(0, 22);
  const p1 = parts[1] || '对手暗中反扑';
  const p2 = parts[2] || '幕后操盘者';
  const hook = HOOKS[idx % HOOKS.length];
  const scene = SCENES[(idx + 3) % SCENES.length];
  const twist = TWISTS[(idx + 7) % TWISTS.length];
  const open = blurb.replace(/。$/u, '');
  return [
    `首集：${open}，${p0}，主角须在${hook}完成第一步布局。`,
    `次集：「${label}」推进中${p1}，主角在${scene}试探对手底线并拿到线索。`,
    `第三集：${twist}，${p2}联手施压，主角被迫清理内部变量。`,
    `第四集：${scene}正面对决，主角以证据/实力/智谋完成当面翻盘。`,
    `第五集：${cat}主线余波未平，新线索显示「${label}」背后还有更高层操盘。`,
  ];
}

function normalizeGroup(g) {
  return {
    cat: g.cat,
    tags: g.tags,
    items: g.items.map((row, idx) => {
      const [label, blurb, core] = row;
      const m = meta(g.cat, core);
      return {
        label,
        blurb,
        idea: idea(g.cat, m.role, m.conflict, m.foe, m.tone),
        episodes: beats(g.cat, idx, label, blurb, core),
      };
    }),
  };
}

export const scriptCats = [...legacyScriptCats, ...extraScriptCats].map(normalizeGroup);