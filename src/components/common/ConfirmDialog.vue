<script setup lang="ts">
/**
 * src/components/common/ConfirmDialog.vue — 二次确认弹层（长按删除等高风险操作）
 *
 * - 受控：v-model:open 切换显隐
 * - props：title / content / okText / cancelText / danger（红色主按钮）
 * - emits：'ok' / 'cancel'；点遮罩 / Esc 默认走 cancel（除非 closeOnMask=false）
 *
 * 视觉：居中卡片 + 顶层遮罩；与 Toast 共栈但 z-index 略低
 */
import { onBeforeUnmount, ref, watch } from 'vue'
import { overlayMaskColor, useOverlayThemeColor } from '@/composables/useOverlayThemeColor'

interface Props {
  open: boolean
  title?: string
  content?: string
  okText?: string
  cancelText?: string
  danger?: boolean
  closeOnMask?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  title: '提示',
  content: '',
  okText: '确定',
  cancelText: '取消',
  danger: false,
  closeOnMask: true,
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'ok'): void
  (e: 'cancel'): void
}>()

// iOS Safari：确认弹窗 open 时联动 chrome 颜色（多层栈管理：可叠加在浮层之上）
useOverlayThemeColor(
  () => props.open,
  overlayMaskColor(20, 20, 20, 0.42),
)

const dialogRef = ref<HTMLDivElement | null>(null)

function close() {
  emit('update:open', false)
}
function onOk() {
  emit('ok')
  close()
}
function onCancel() {
  emit('cancel')
  close()
}
function onMaskClick() {
  if (props.closeOnMask) onCancel()
}
function onKey(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    onCancel()
  }
}
watch(
  () => props.open,
  (v) => {
    if (typeof window === 'undefined') return
    if (v) window.addEventListener('keydown', onKey)
    else window.removeEventListener('keydown', onKey)
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <transition name="confirm-fade">
      <div
        v-if="open"
        class="confirm-mask"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        @click.self="onMaskClick"
      >
        <div ref="dialogRef" class="confirm-card" @click.stop>
          <h3 class="confirm-title">{{ title }}</h3>
          <p v-if="content" class="confirm-content">{{ content }}</p>
          <div class="confirm-actions">
            <button type="button" class="btn btn-cancel" @click="onCancel">
              {{ cancelText }}
            </button>
            <button
              type="button"
              class="btn btn-ok"
              :class="{ 'btn-danger': danger }"
              @click="onOk"
            >
              {{ okText }}
            </button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.confirm-mask {
  position: fixed;
  inset: 0;
  /* iOS safe-area 兜底（详见 main.css 注释） */
  min-height: 100vh;
  min-height: 100dvh;
  z-index: 9000;
  background: rgba(20, 20, 20, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  /* 用 max() 把 safe-area 纳入 padding，避免确认弹窗被刘海或 home indicator 遮挡 */
  padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom));
}
.confirm-card {
  width: 100%;
  max-width: 320px;
  background: #fff;
  border-radius: 14px;
  padding: 22px 20px 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.18);
}
.confirm-title {
  font-size: 17px;
  font-weight: 600;
  color: #222;
  margin: 0 0 8px;
  text-align: center;
}
.confirm-content {
  font-size: 14px;
  color: #555;
  line-height: 1.55;
  margin: 0 0 18px;
  text-align: center;
  white-space: pre-line;
  word-break: break-word;
}
.confirm-actions {
  display: flex;
  gap: 10px;
}
.btn {
  flex: 1;
  appearance: none;
  border: none;
  border-radius: 10px;
  padding: 11px 0;
  font-size: 15px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.btn-cancel {
  background: #f1f3f5;
  color: #444;
}
.btn-cancel:hover {
  background: #e6e9ee;
}
.btn-ok {
  background: #4a8d5e;
  color: #fff;
}
.btn-ok:hover {
  background: #3f7a51;
}
.btn-danger {
  background: #c94646;
}
.btn-danger:hover {
  background: #b03a3a;
}

.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.18s ease;
}
.confirm-fade-enter-active .confirm-card,
.confirm-fade-leave-active .confirm-card {
  transition: transform 0.18s ease;
}
.confirm-fade-enter-from {
  opacity: 0;
}
.confirm-fade-enter-from .confirm-card {
  transform: translateY(8px) scale(0.98);
}
.confirm-fade-leave-to {
  opacity: 0;
}
.confirm-fade-leave-to .confirm-card {
  transform: scale(0.98);
}
</style>
