import { defineConfig } from 'vite';

export default defineConfig({
  // 相对路径 base：Web 版（Express 托管 / vite dev 均基于根路径）无影响，
  // Android WebView 从 file:///android_asset/web/index.html 加载时资源可解析
  base: './',
  server: {
    port: 5173,
    open: true,
    // 开发期把 /api 代理到后端 3001，避免跨域
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    include: ['three', 'd3-geo']
  },
  build: {
    // Android 真机 WebView 可能较旧（P20 自带 Chrome 83）：降低产物语法目标，
    // 避免 ES2020+ 语法在旧 WebView 解析失败；对现代浏览器上的 Web 版无副作用
    target: 'chrome83',
    rollupOptions: {
      output: {
        // Keep the rendering engine out of the application entry chunk. This
        // avoids loading the large three.js bundle with the app bootstrap.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/three/')) return 'three';
          if (id.includes('/d3-geo/')) return 'geo';
          return 'vendor';
        }
      }
    }
  }
});
