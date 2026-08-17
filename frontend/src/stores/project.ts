import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/api';

export type Project = {
  id: string;
  title: string;
  description: string;
  styleBrief: string;
  progress: Record<string, boolean>;
  archived: boolean;
  updatedAt: string;
  storyState?: {
    openHooks?: Array<{ id?: string; text?: string; chapterOrder?: number }>;
    timelineNote?: string;
    targetWordsWan?: number;
    volumeCount?: number;
    timeline?: Array<{
      id?: string;
      chapterId?: string;
      chapterOrder?: number;
      chapterTitle?: string;
      when?: string;
      where?: string;
      events?: string[];
      summary?: string;
    }>;
  };
  coverUrl?: string;
  coverAssetId?: string;
};

export const useProjectStore = defineStore('project', () => {
  const current = ref<Project | null>(null);
  const list = ref<Project[]>([]);

  async function fetchList() {
    const { data } = await api.get('/projects');
    list.value = data;
    return data;
  }

  async function setCurrent(id: string) {
    const { data } = await api.get(`/projects/${id}`);
    current.value = data;
    return data;
  }

  return { current, list, fetchList, setCurrent };
});
