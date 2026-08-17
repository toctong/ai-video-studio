import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@ai-video-studio/shared': resolve(__dirname, '../packages/shared/src/index.ts'),
    },
  },
  server: {
    // Windows 上默认 ::1 易触发 EACCES；固定 IPv4 本机回环
    host: '127.0.0.1',
    port: 5177,
    strictPort: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:47822',
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
        // 避免代理缓冲 SSE，保证对话流式增量能即时到达前端
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            const ct = String(proxyRes.headers['content-type'] || '');
            if (ct.includes('text/event-stream')) {
              proxyRes.headers['cache-control'] = 'no-cache, no-transform';
              proxyRes.headers['x-accel-buffering'] = 'no';
            }
          });
        },
      },
      '/health': { target: 'http://127.0.0.1:47822', changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // 按大依赖分包：首屏只拉必要代码，其余按需缓存
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('element-plus') || id.includes('@element-plus')) return 'el-plus';
          if (id.includes('echarts')) return 'echarts';
          if (id.includes('tiptap') || id.includes('prosemirror')) return 'tiptap';
          if (id.includes('wangeditor')) return 'wangeditor';
          if (id.includes('a2ui')) return 'a2ui';
          if (id.includes('vue-flow')) return 'vue-flow';
          if (id.includes('markdown-it') || id.includes('highlight.js') || id.includes('dompurify')) return 'markdown';
          if (id.includes('artplayer')) return 'artplayer';
          if (id.includes('vanilla-jsoneditor')) return 'jsoneditor';
          return 'vendor';
        },
      },
    },
  },
});
