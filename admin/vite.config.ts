import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  base: '/admin/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5178,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:47822',
        changeOrigin: true,
      },
      '/health': { target: 'http://127.0.0.1:47822', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
