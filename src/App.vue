<script setup lang="ts">
// 应用根组件：承载 <RouterView /> + 全局 Toast 容器（G4 起接入）
// G11 起额外监听 navigator online/offline 事件，断网时挂一条不自动消失的 toast，
// 重新连上后立即关闭并提示「已恢复」（plan G11 弱网失败 Toast）。
import { onBeforeUnmount, onMounted } from 'vue'
import Toast from '@/components/common/Toast.vue'
import { toast } from '@/composables/useToast'

let offlineToastId: number | null = null

function onOffline() {
  if (offlineToastId == null) {
    // duration=0 → 不自动消失；用户点击或重新连上后才收
    offlineToastId = toast.error('网络已断开，操作可能失败', 0)
  }
}

function onOnline() {
  if (offlineToastId != null) {
    toast.dismiss(offlineToastId)
    offlineToastId = null
    toast.success('网络已恢复')
  }
}

onMounted(() => {
  if (typeof window === 'undefined') return
  window.addEventListener('offline', onOffline)
  window.addEventListener('online', onOnline)
  // 进入页面时已离线 → 立即挂条提示
  if (typeof navigator !== 'undefined' && navigator.onLine === false) onOffline()
})

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return
  window.removeEventListener('offline', onOffline)
  window.removeEventListener('online', onOnline)
})
</script>

<template>
  <RouterView />
  <Toast />
</template>
