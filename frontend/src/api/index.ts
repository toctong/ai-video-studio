import axios from 'axios';
import { useAuthStore } from '@/stores/auth';
import { useProjectStore } from '@/stores/project';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const auth = useAuthStore();
  if (auth.token) config.headers.Authorization = `Bearer ${auth.token}`;
  const project = useProjectStore();
  const projectId = project.current?.id;
  if (projectId) config.headers['x-project-id'] = projectId;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err?.response?.status;
    const url = String(err?.config?.url || '');

    if (status === 401) {
      // /auth/me、/auth/login 失败不弹框，避免启动闪屏
      if (!url.includes('/auth/me') && !url.includes('/auth/login')) {
        const auth = useAuthStore();
        auth.clearSession();
        auth.openLoginDialog();
      }
    }
    return Promise.reject(err);
  },
);

export default api;
