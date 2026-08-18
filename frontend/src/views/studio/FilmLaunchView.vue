<template>
  <div class="film-launch" v-loading="busy" :element-loading-text="statusText">
    <div class="launch-copy">
      <strong>制作大片</strong>
      <p>{{ statusText }}</p>
      <button v-if="failed" type="button" class="retry" @click="launch">重试</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import {
  createFilmProject,
  fetchFilmEpisodes,
  isFilmEpisode,
  type FilmProject,
} from '@/api/film-projects';

const router = useRouter();
const route = useRoute();
const busy = ref(true);
const failed = ref(false);
const statusText = ref('正在进入制作流水线…');
let launching = false;

function goPipeline(id: string) {
  const from = String(route.query.from || '').trim();
  return router.replace({
    path: `/films/${id}`,
    query: {
      step: '1',
      ...(from === 'article' ? { from: 'article' } : {}),
    },
  });
}

function pickResume(list: FilmProject[]) {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) =>
    String(b.updatedAt || b.createdAt || '').localeCompare(
      String(a.updatedAt || a.createdAt || ''),
    ),
  );
  return sorted[0] || null;
}

async function launch() {
  if (launching) return;
  launching = true;
  busy.value = true;
  failed.value = false;
  statusText.value = '正在进入制作流水线…';
  const forceNew =
    route.query.new === '1' ||
    route.query.new === 'true' ||
    String(route.query.mode || '') === 'create';

  try {
    if (!forceNew) {
      statusText.value = '正在打开最近项目…';
      const episodes = (await fetchFilmEpisodes()).filter(isFilmEpisode);
      const resume = pickResume(episodes);
      if (resume?.id) {
        await goPipeline(resume.id);
        return;
      }
    }

    statusText.value = '正在创建未命名项目…';
    const project = await createFilmProject('未命名项目');
    if (!project?.id) throw new Error('创建失败：未返回项目 ID');
    await goPipeline(project.id);
  } catch (e: any) {
    failed.value = true;
    statusText.value = e?.response?.data?.message || e?.message || '进入制作失败';
    ElMessage.error(statusText.value);
  } finally {
    busy.value = false;
    launching = false;
  }
}

onMounted(() => {
  void launch();
});

watch(
  () => [route.query.new, route.query.mode, route.query.from],
  () => {
    if (route.path === '/films') void launch();
  },
);
</script>

<style scoped>
.film-launch {
  min-height: 100%;
  display: grid;
  place-items: center;
  background: #0c0c0c;
  color: #f5f5f5;
}
.launch-copy {
  text-align: center;
  padding: 24px;
}
.launch-copy strong {
  display: block;
  font-size: 18px;
  margin-bottom: 8px;
}
.launch-copy p {
  margin: 0;
  font-size: 13px;
  color: #a3a3a3;
  max-width: 360px;
}
.retry {
  margin-top: 16px;
  height: 36px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  background: #2563eb;
  color: #ffffff;
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}
</style>
