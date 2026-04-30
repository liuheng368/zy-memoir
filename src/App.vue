<script setup lang="ts">
// 应用根组件：承载 <RouterView /> + 全局 Toast 容器（G4 起接入；
// G10 视觉打磨阶段再补 UploadModal / RecordModal 全局位）
import Toast from '@/components/common/Toast.vue'
</script>

<template>
  <RouterView />
  <Toast />
</template>
