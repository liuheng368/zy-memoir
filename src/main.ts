import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { installCloudBaseProxyPatch } from './api/cloudbasePatch'
import './assets/styles/main.css'

// plan.md「方案 K」：EdgeOne Pages 上把 CloudBase API 请求改走同源 /tcb/* 反代，
// 必须在 cloudbase.init() 之前打补丁
if (import.meta.env.VITE_TCB_PROXY === 'edgeone') {
  installCloudBaseProxyPatch()
}

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
