import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
//
// `base` 路径策略：
//   - 默认 `/`：本地 dev / preview、CloudBase 静态托管（域名根目录）
//   - `GH_PAGES=1` 时切到 `/zy-memoir/`：GitHub Pages 站点 URL 是
//     `https://<user>.github.io/zy-memoir/`，必须带子路径前缀，
//     否则 JS/CSS/router 会 404
export default defineConfig({
  base: process.env.GH_PAGES === '1' ? '/zy-memoir/' : '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    open: false,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 800,
  },
})
