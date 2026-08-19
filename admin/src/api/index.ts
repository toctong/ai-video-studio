import axios from 'axios';
import { Message } from '@arco-design/web-vue';
import { useAuthStore } from '@/stores/auth';
import router from '@/router';

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const auth = useAuthStore();
  if (auth.token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${auth.token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    const msg = err?.response?.data?.message || err.message || '请求失败';
    if (status === 401) {
      const auth = useAuthStore();
      auth.logout();
      if (router.currentRoute.value.path !== '/login') {
        router.push('/login');
      }
    } else if (status === 403) {
      Message.error(typeof msg === 'string' ? msg : '无权限');
    }
    return Promise.reject(err);
  },
);

export default api;

export type PageResult<T> = {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
};
