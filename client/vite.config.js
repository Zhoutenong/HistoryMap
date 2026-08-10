import { defineConfig } from 'vite';

export default defineConfig({
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
