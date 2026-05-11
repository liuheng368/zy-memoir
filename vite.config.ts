import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
//
// `base` 路径策略：统一 `/`（适用于本地 dev / preview、CloudBase 静态托管 /
// EdgeOne Pages / Cloudflare Pages 等根路径部署场景）。
// 历史上的 `GH_PAGES=1 → '/zy-memoir/'` 子路径前缀已随 GitHub Pages 链路下线一并移除。
export default defineConfig({
  base: '/',
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
