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
    const code = err?.response?.data?.code;
    const url = String(err?.config?.url || '');

    if (status === 401) {
      // hydrate 用的 /auth/me 失败时留给路由守卫处理，避免闪跳
      if (!url.includes('/auth/me') && !url.includes('/auth/login')) {
        const auth = useAuthStore();
        auth.clearSession();
        if (!location.pathname.includes('/login')) location.href = '/login';
      }
    } else if (status === 503 && code === 'FILE_OSS_REQUIRED') {
      // 登录页不要强跳，避免「登不进去」的错觉
      if (
        !location.pathname.includes('/settings') &&
        !location.pathname.includes('/login')
      ) {
        location.href = '/settings?section=storage';
      }
    }
    return Promise.reject(err);
  },
);

export default api;
