<template>
  <div class="toolbox-page">
    <header class="page-hero">
      <h1>工具箱</h1>
      <p class="sub">把生成、提示词、资产、模型与系统能力集中在一起，按需进入。</p>
    </header>

    <section class="tool-grid">
      <article v-for="tool in tools" :key="tool.path" class="tool-card" :class="tool.tone" @click="open(tool)">
        <span class="tool-icon"><UiIcon :name="tool.icon" :size="24" /></span>
        <div class="tool-copy">
          <strong>{{ tool.title }}</strong>
          <p>{{ tool.desc }}</p>
        </div>
        <span class="tool-arrow">→</span>
      </article>
    </section>

    <section class="tips">
      <h2>推荐流程</h2>
      <div class="flow">
        <div v-for="(step, i) in flow" :key="step" class="flow-step">
          <span>{{ i + 1 }}</span>
          <p>{{ step }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import UiIcon from '@/components/icons/UiIcon.vue';
import type { IconName } from '@/components/icons/types';

type Tool = {
  path: string;
  title: string;
  desc: string;
  icon: IconName;
  tone: string;
  external?: boolean;
};

const router = useRouter();

const tools: Tool[] = [
  { path: '/films?new=1', title: '制作大片', desc: '进入六步流水线：剧本 → 设定 → 分镜 → 成片', icon: 'clapperboard', tone: 'tone-a' },
  { path: '/generate', title: '生成工作台', desc: '会话式生成、参考图引用与任务跟进', icon: 'message', tone: 'tone-b' },
  { path: '/skills', title: '提示词广场', desc: '复用官方与社区高质量提示词', icon: 'sparkles', tone: 'tone-c' },
  { path: '/assets', title: '资产管理', desc: '统一浏览、清理、导出图片 / 视频 / 音频资产', icon: 'images', tone: 'tone-d' },
  { path: '/models', title: '模型管理', desc: '配置火山方舟 API Key 与默认模型', icon: 'cpu', tone: 'tone-e' },
  { path: '/settings?section=storage', title: '任务与存储', desc: '设置对象存储、任务并发与 Hub 同步', icon: 'settings', tone: 'tone-f' },
];

const flow = ['进入制作大片并输入灵感', '完成视频设定与场景资产', '拆分镜并逐镜生成视频', '在预览页检查并导出成片'];

function open(tool: Tool) {
  if (tool.external) {
    window.open(tool.path, '_blank');
    return;
  }
  const [path, query] = tool.path.split('?');
  void router.push({ path, query: query ? Object.fromEntries(new URLSearchParams(query)) : {} });
}
</script>

<style scoped>
.toolbox-page {
  max-width: 1280px;
  margin: 0 auto;
  padding: 22px 28px 56px;
  color: var(--studio-ink);
}
.page-hero {
  margin-bottom: 22px;
}
.page-hero h1 {
  margin: 0;
  font-size: 30px;
  letter-spacing: -0.04em;
  font-weight: 750;
}
.sub {
  margin: 10px 0 0;
  color: var(--studio-muted);
  font-size: 14px;
  line-height: 1.7;
  max-width: 760px;
}
.tool-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.tool-card {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 118px;
  padding: 18px;
  border: 1px solid var(--studio-line);
  border-radius: 20px;
  background: var(--studio-panel);
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.tool-card:hover {
  transform: translateY(-2px);
  border-color: var(--studio-line-bright);
  box-shadow: var(--shadow-hover);
}
.tool-card.tone-a:hover { border-color: rgba(52, 211, 153, 0.45); }
.tool-card.tone-b:hover { border-color: rgba(96, 165, 250, 0.45); }
.tool-card.tone-c:hover { border-color: rgba(251, 191, 36, 0.45); }
.tool-icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: rgba(52, 211, 153, 0.12);
  color: #6ee7b7;
  flex: 0 0 auto;
}
.tool-card.tone-b .tool-icon { background: rgba(96, 165, 250, 0.12); color: #93c5fd; }
.tool-card.tone-c .tool-icon { background: rgba(251, 191, 36, 0.12); color: #fcd34d; }
.tool-card.tone-d .tool-icon { background: rgba(167, 139, 250, 0.12); color: #c4b5fd; }
.tool-card.tone-e .tool-icon { background: rgba(45, 212, 191, 0.12); color: #5eead4; }
.tool-card.tone-f .tool-icon { background: rgba(163, 163, 163, 0.12); color: #d4d4d4; }
.tool-copy {
  min-width: 0;
  flex: 1;
}
.tool-copy strong {
  display: block;
  margin-bottom: 6px;
  font-size: 16px;
}
.tool-copy p {
  margin: 0;
  color: var(--studio-muted);
  font-size: 13px;
  line-height: 1.55;
}
.tool-arrow {
  color: var(--studio-muted);
  font-size: 18px;
}
.tips {
  margin-top: 28px;
  padding: 18px;
  border-radius: 20px;
  border: 1px solid var(--studio-line);
  background: var(--studio-panel);
}
.tips h2 {
  margin: 0 0 14px;
  font-size: 16px;
}
.flow {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.flow-step {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 14px;
  background: var(--studio-glass);
}
.flow-step span {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: rgba(52, 211, 153, 0.18);
  color: #6ee7b7;
  font-size: 12px;
  font-weight: 700;
  flex: 0 0 auto;
}
.flow-step p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--studio-text);
}
@media (max-width: 980px) {
  .tool-grid,
  .flow {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 640px) {
  .tool-grid,
  .flow {
    grid-template-columns: 1fr;
  }
}
</style>
