<script setup lang="ts">
/**
 * src/components/common/Toast.vue — 全局 Toast 容器（挂在 App.vue 根）
 *
 * - 监听 `useToast()` 的模块级 reactive 队列；最多显示 3 条
 * - 类型映射图标：success ✓ / error ✕ / info ⓘ / loading ↻（CSS spin）
 * - tap 任意 toast 立即 dismiss；error / info 不带图标也能 ok
 */
import { useToast } from '@/composables/useToast'

const { items, dismiss } = useToast()
</script>

<template>
  <Teleport to="body">
    <div class="toast-stack" aria-live="polite" aria-atomic="true">
      <transition-group name="toast" tag="div" class="toast-list">
        <div
          v-for="t in items"
          :key="t.id"
          class="toast-item"
          :data-type="t.type"
          role="status"
          @click="dismiss(t.id)"
        >
          <span class="toast-icon" aria-hidden="true">
            <template v-if="t.type === 'success'">✓</template>
            <template v-else-if="t.type === 'error'">✕</template>
            <template v-else-if="t.type === 'loading'">
              <span class="loading-spin">↻</span>
            </template>
            <template v-else>ⓘ</template>
          </span>
          <span class="toast-message">{{ t.message }}</span>
        </div>
      </transition-group>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  top: max(20px, env(safe-area-inset-top));
  left: 0;
  right: 0;
  z-index: 9999;
  pointer-events: none;
  display: flex;
  justify-content: center;
}
.toast-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
  max-width: 92vw;
}
.toast-item {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 999px;
  background: rgba(40, 40, 40, 0.94);
  color: #fff;
  font-size: 14px;
  line-height: 1.4;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
  max-width: 80vw;
  cursor: pointer;
  user-select: none;
}
.toast-item[data-type='success'] {
  background: rgba(46, 160, 86, 0.95);
}
.toast-item[data-type='error'] {
  background: rgba(204, 64, 64, 0.95);
}
.toast-item[data-type='loading'] {
  background: rgba(50, 96, 188, 0.95);
}
.toast-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  font-weight: 700;
}
.loading-spin {
  display: inline-block;
  animation: toast-spin 1s linear infinite;
}
@keyframes toast-spin {
  to {
    transform: rotate(360deg);
  }
}
.toast-message {
  word-break: break-word;
}
.toast-enter-active,
.toast-leave-active {
  transition: all 0.24s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-12px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
