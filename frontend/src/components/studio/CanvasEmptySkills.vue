<template>
  <div class="empty-skills-root">
    <p class="empty-hint">
      <UiIcon name="mouse-pointer" :size="14" />
      <span>右键新建节点开启创作</span>
    </p>

    <div class="empty-skills-row">
      <div
        v-for="cat in categories"
        :key="cat.id"
        class="card-container"
        :class="[cat.tone, { expanded: expandedId === cat.id }]"
        @click.self="toggle(cat.id)"
      >
        <div class="shadow-card shadow-1" aria-hidden="true" />
        <div class="shadow-card shadow-2" aria-hidden="true" />
        <div class="glow-line" aria-hidden="true" />

        <button
          type="button"
          class="main-card"
          :title="cat.label"
          @click.stop="toggle(cat.id)"
        >
          <div class="glow-1" aria-hidden="true" />
          <div class="glow-2" aria-hidden="true" />
          <span class="icon-wrap">
            <UiIcon :name="cat.icon" :size="14" />
          </span>
          <span class="main-text">{{ cat.label }}</span>
          <span class="right-orb" aria-hidden="true" />
        </button>

        <div class="expand-cards">
          <div
            v-for="(child, idx) in cat.children"
            :key="child.id"
            class="expand-card"
            :class="slotClass(idx, cat.children.length)"
            :title="child.desc ? `${child.label}\n${child.desc}` : child.label"
          >
            <button type="button" class="expand-launch" @click.stop="emit('pick', child)">
              <span class="expand-ico" :class="child.tone">
                <UiIcon :name="child.icon || cat.icon" :size="16" />
              </span>
              <span class="expand-name">{{ child.label }}</span>
            </button>
            <router-link
              class="expand-detail"
              :to="child.skillsPath || '/skills'"
              :title="`查看${child.label}详情`"
              @click.stop
            >
              <UiIcon name="info" :size="14" />
            </router-link>
          </div>
        </div>
      </div>
    </div>

    <router-link class="empty-skills-link" to="/skills">
      探索更多提示词工作流 <em>@提示词广场</em>
    </router-link>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import UiIcon from '@/components/icons/UiIcon.vue';
import type { IconName } from '@/components/icons/types';

export type EmptySkillChild = {
  id: string;
  label: string;
  desc?: string;
  icon?: IconName;
  tone?: string;
  /** 启动动作：由画布父级处理 */
  action?: 'library' | 'script' | 'pipeline' | 'skills';
  skillsPath?: string;
};

export type EmptySkillCategory = {
  id: string;
  label: string;
  icon: IconName;
  tone: string;
  children: EmptySkillChild[];
};

const categories: EmptySkillCategory[] = [
  {
    id: 'script',
    label: '剧本资产管理',
    icon: 'file-text',
    tone: 'tone-script',
    children: [
      {
        id: 'script-plan',
        label: '剧本策划助手',
        desc: '对剧本、故事梗概、角色设定做诊断与结构优化',
        action: 'script',
        skillsPath: '/skills',
      },
      {
        id: 'script-art',
        label: '剧本直出美术资产',
        desc: '将剧本拆解为资产清单与设定方向',
        action: 'library',
        skillsPath: '/skills',
      },
      {
        id: 'char-board',
        label: '专业角色设定板',
        desc: '角色外形、性格与关系设定',
        action: 'library',
        skillsPath: '/skills',
      },
    ],
  },
  {
    id: 'board',
    label: '分镜制作',
    icon: 'clapperboard',
    tone: 'tone-board',
    children: [
      {
        id: 'storyboard',
        label: '剧本转分镜故事板',
        action: 'script',
        skillsPath: '/skills',
      },
      {
        id: 'lighting',
        label: '分镜光影设计',
        action: 'pipeline',
        skillsPath: '/skills',
      },
      {
        id: 'multiview',
        label: '人物多视角生成',
        action: 'pipeline',
        skillsPath: '/skills',
      },
    ],
  },
  {
    id: 'image',
    label: '生图辅助',
    icon: 'image',
    tone: 'tone-image',
    children: [
      { id: 'img-prompt', label: '生图提示词优化', action: 'pipeline', skillsPath: '/skills' },
      { id: 'img-reverse', label: '图片提示词反推', action: 'pipeline', skillsPath: '/skills' },
      { id: 'img-style', label: '图片风格迁移', action: 'pipeline', skillsPath: '/skills' },
    ],
  },
  {
    id: 'video',
    label: '视频优化',
    icon: 'wand',
    tone: 'tone-video',
    children: [
      { id: 'video-fix', label: '问题视频返修', action: 'pipeline', skillsPath: '/skills' },
      { id: 'shot-reverse', label: '分镜提示词逆向', action: 'script', skillsPath: '/skills' },
    ],
  },
];

const emit = defineEmits<{
  pick: [child: EmptySkillChild];
}>();

const expandedId = ref<string | null>(null);

function toggle(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}

/** 子卡扇出：上 1/2/3、下 1/2/3 */
function slotClass(idx: number, total: number) {
  if (total <= 1) return 'slot-top1';
  if (total === 2) return idx === 0 ? 'slot-top1' : 'slot-bottom1';
  // 3+: 交错上下
  const map = ['slot-top1', 'slot-bottom1', 'slot-top2', 'slot-bottom2', 'slot-top3', 'slot-bottom3'];
  return map[idx] || 'slot-bottom1';
}
</script>

<style scoped>
.empty-skills-root {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  width: 100%;
  max-width: 960px;
  pointer-events: none;
}
.empty-hint {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--studio-text-faint);
  font-size: 12px;
  letter-spacing: 0.02em;
}
.empty-skills-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 18px 16px;
  /* 空白穿透到画布，才能右键新建；只有卡片自己接事件 */
  pointer-events: none;
  padding: 180px 8px;
  margin: -180px 0;
}
.card-container {
  position: relative;
  width: 214px;
  height: 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  pointer-events: auto;
  --card-accent: #cfcfcf;
  --card-glow: rgba(180, 180, 180, 0.35);
  --card-glow-inner: rgba(160, 160, 160, 0.18);
  --card-glow-line-from: rgba(180, 180, 180, 0);
  --card-glow-line-mid: rgba(180, 180, 180, 0.25);
}
.tone-script {
  --card-accent: #7dd3fc;
  --card-glow: rgba(99, 177, 255, 0.41);
  --card-glow-inner: rgba(40, 180, 255, 0.22);
  --card-glow-line-from: rgba(84, 155, 255, 0);
  --card-glow-line-mid: rgba(84, 155, 255, 0.3);
}
.tone-board {
  --card-accent: #bb9cff;
  --card-glow: rgba(155, 99, 255, 0.41);
  --card-glow-inner: rgba(160, 40, 255, 0.22);
  --card-glow-line-from: rgba(155, 84, 255, 0);
  --card-glow-line-mid: rgba(155, 84, 255, 0.3);
}
.tone-image {
  --card-accent: #fbbf24;
  --card-glow: rgba(251, 191, 36, 0.38);
  --card-glow-inner: rgba(245, 158, 11, 0.22);
  --card-glow-line-from: rgba(251, 191, 36, 0);
  --card-glow-line-mid: rgba(251, 191, 36, 0.3);
}
.tone-video {
  --card-accent: #c4b5fd;
  --card-glow: rgba(167, 139, 250, 0.4);
  --card-glow-inner: rgba(139, 92, 246, 0.22);
  --card-glow-line-from: rgba(167, 139, 250, 0);
  --card-glow-line-mid: rgba(167, 139, 250, 0.3);
}
.shadow-card {
  width: 200px;
  height: 44px;
  border-radius: 10px;
  position: absolute;
  top: 0;
  left: 50%;
  margin-left: -100px;
  transition: 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  pointer-events: none;
}
.shadow-1 {
  z-index: 8;
  transform-origin: right bottom;
  transform: rotate(3deg);
  background: var(--studio-glass-2);
  border: 1px solid var(--studio-glass-2);
}
.shadow-2 {
  z-index: 6;
  transform-origin: left bottom;
  transform: rotate(-3deg);
  background: var(--studio-glass);
  border: 1px solid var(--studio-glass);
}
.card-container.expanded .shadow-1,
.card-container.expanded .shadow-2 {
  opacity: 0;
  transform: rotate(0deg);
}
.glow-line {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 140px;
  height: 1px;
  background: linear-gradient(
    90deg,
    var(--card-glow-line-from) 0%,
    var(--card-glow-line-mid) 50%,
    var(--card-glow-line-from) 100%
  );
  pointer-events: none;
  z-index: 11;
}
.main-card {
  width: 214px;
  height: 56px;
  background: color-mix(in srgb, var(--studio-panel) 94%, transparent);
  border: 1px solid var(--studio-glass-3);
  border-radius: 12px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  box-sizing: border-box;
  position: relative;
  z-index: 10;
  overflow: hidden;
  cursor: pointer;
  color: var(--studio-ink);
  font: inherit;
  transition: border-color 0.16s ease;
}
.main-card:hover {
  border-color: var(--studio-line-strong);
}
.glow-1 {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translate(-50%, 50%);
  width: 164px;
  height: 58px;
  border-radius: 164px;
  background: var(--card-glow);
  filter: blur(26.95px);
  pointer-events: none;
}
.glow-2 {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translate(-50%, 50%);
  width: 100px;
  height: 16px;
  border-radius: 100px;
  background: var(--card-glow-inner);
  filter: blur(15px);
  pointer-events: none;
}
.icon-wrap {
  width: 22px;
  height: 22px;
  background: var(--studio-glass);
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 10px;
  flex-shrink: 0;
  color: var(--studio-text-strong);
  position: relative;
  z-index: 1;
}
.main-text {
  position: relative;
  z-index: 1;
  font-size: 13px;
  font-weight: 550;
  letter-spacing: 0.01em;
}
.right-orb {
  position: absolute;
  top: 50%;
  right: -6px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  transform: translateY(-50%) rotate(-12deg);
  background: radial-gradient(
    circle at 32% 30%,
    color-mix(in srgb, var(--card-accent) 92%, #fff),
    var(--card-accent) 42%,
    transparent 68%
  );
  opacity: 0.85;
  pointer-events: none;
  filter: saturate(1.1);
}
.expand-cards {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 5;
  width: 0;
  height: 0;
}
.expand-card {
  position: absolute;
  left: 50%;
  top: 50%;
  margin-left: -100px;
  margin-top: -28px;
  width: 200px;
  height: 56px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 6px;
  opacity: 0;
  transform: translateY(0) scale(0.9);
  transition: 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
  background: color-mix(in srgb, var(--studio-panel) 94%, transparent);
  border: 1px solid rgba(255, 255, 255, 0.11);
  color: var(--studio-ink);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}
.card-container.expanded .expand-card {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
}
.card-container.expanded .expand-card.slot-top1 {
  transform: translateY(-84px) scale(1);
  transition-delay: 0.05s;
}
.card-container.expanded .expand-card.slot-top2 {
  transform: translateY(-168px) scale(1);
  transition-delay: 0.1s;
}
.card-container.expanded .expand-card.slot-top3 {
  transform: translateY(-252px) scale(1);
  transition-delay: 0.15s;
}
.card-container.expanded .expand-card.slot-bottom1 {
  transform: translateY(84px) scale(1);
  transition-delay: 0.05s;
}
.card-container.expanded .expand-card.slot-bottom2 {
  transform: translateY(168px) scale(1);
  transition-delay: 0.1s;
}
.card-container.expanded .expand-card.slot-bottom3 {
  transform: translateY(252px) scale(1);
  transition-delay: 0.15s;
}
.expand-card:hover {
  border-color: var(--studio-line-bright);
  background: color-mix(in srgb, var(--studio-panel) 96%, transparent);
}
.expand-launch {
  min-width: 0;
  flex: 1;
  align-self: stretch;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 0 0 12px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.expand-ico {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: var(--studio-glass-2);
  color: var(--studio-text-strong);
}
.expand-name {
  min-width: 0;
  max-width: 112px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 1.2;
}
.expand-detail {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: rgba(250, 250, 250, 0.56);
  text-decoration: none;
  flex-shrink: 0;
}
.expand-detail:hover {
  background: var(--studio-glass-2);
  color: rgba(250, 250, 250, 0.92);
}
.empty-skills-link {
  pointer-events: auto;
  font-size: 12.5px;
  color: var(--studio-text-faint);
  text-decoration: none;
}
.empty-skills-link em {
  font-style: normal;
  color: var(--studio-text-soft);
}
.empty-skills-link:hover,
.empty-skills-link:hover em {
  color: var(--studio-text-strong);
}
@media (max-width: 960px) {
  .empty-skills-row {
    gap: 14px;
    padding: 140px 8px;
    margin: -140px 0;
  }
}
</style>
