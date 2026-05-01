<script setup lang="ts">
/**
 * src/components/common/Lightbox.vue — 通用图片放大遮罩（PRD v0.4 二期 / spec §6.2 / Q19）
 *
 * - 受控：v-model:open
 * - props：src（图片地址）、alt（无障碍描述）
 * - 关闭：点击图片外区域 / 按 ESC / 点 ✕
 * - z-index 9000（最上层；裁剪 8500、浮层 8000）
 * - 仅头像点击接入（避免与照片墙长按手势冲突）
 */
import { onBeforeUnmount, watch } from 'vue'

interface Props {
  open: boolean
  src: string
  alt?: string
}
const props = withDefaults(defineProps<Props>(), { alt: '' })

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
}>()

function close() {
  emit('update:open', false)
}

function onKey(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    close()
  }
}

watch(
  () => props.open,
  (v) => {
    if (typeof window === 'undefined') return
    if (v) {
      window.addEventListener('keydown', onKey, true)
    } else {
      window.removeEventListener('keydown', onKey, true)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey, true)
})
</script>

<template>
  <Teleport to="body">
    <transition name="lightbox-fade">
      <div
        v-if="open"
        class="lightbox-mask"
        role="dialog"
        aria-modal="true"
        :aria-label="alt || '查看大图'"
        @click.self="close"
      >
        <button type="button" class="lightbox-close" aria-label="关闭" @click.stop="close">
          ✕
        </button>
        <img v-if="src" class="lightbox-img" :src="src" :alt="alt" @click.stop="close" />
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.lightbox-mask {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(10, 10, 10, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
}
.lightbox-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
}
.lightbox-close:hover {
  background: rgba(255, 255, 255, 0.28);
}
.lightbox-img {
  max-width: min(92vw, 900px);
  max-height: 88vh;
  object-fit: contain;
  border-radius: 6px;
  box-shadow: 0 12px 60px rgba(0, 0, 0, 0.6);
  cursor: zoom-out;
}

.lightbox-fade-enter-active,
.lightbox-fade-leave-active {
  transition: opacity 0.2s ease;
}
.lightbox-fade-enter-active .lightbox-img,
.lightbox-fade-leave-active .lightbox-img {
  transition: transform 0.2s ease;
}
.lightbox-fade-enter-from {
  opacity: 0;
}
.lightbox-fade-enter-from .lightbox-img {
  transform: scale(0.96);
}
.lightbox-fade-leave-to {
  opacity: 0;
}
.lightbox-fade-leave-to .lightbox-img {
  transform: scale(0.98);
}
</style>
