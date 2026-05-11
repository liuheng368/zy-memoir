<script setup lang="ts">
/**
 * src/components/common/AvatarCropper.vue — 头像裁剪弹层（PRD v0.4 二期 / spec §6.1 / Q18）
 *
 * - 受控：v-model:open
 * - props：file（待裁剪原图，File | null）
 * - emits：'confirm'(blob)、'cancel'、'reselect'（用户点"重选"，由父组件重新弹文件选择器）
 *
 * 实现要点：
 * - 自实现 Canvas 裁剪（避免引 cropperjs ~80KB gz）；正方形 1:1，输出 AVATAR_CROP_OUTPUT_PX × AVATAR_CROP_OUTPUT_PX JPEG
 * - 手势：单指拖拽（pointer events）、滚轮缩放（PC）、双指 pinch 缩放（移动）
 * - 初始 cover 适配；缩放下限 = cover 比例（避免出现白边），上限 = cover * 4
 * - z-index 8500（介于浮层 8000 与 lightbox 9000 之间，spec Q-PLAN-2-2）
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { AVATAR_CROP_OUTPUT_PX } from '@/utils/constants'
import { overlayMaskColor, useOverlayThemeColor } from '@/composables/useOverlayThemeColor'

interface Props {
  open: boolean
  file: File | null
}
const props = defineProps<Props>()

// iOS Safari：裁剪弹层 open 时联动 chrome 颜色
useOverlayThemeColor(
  () => props.open,
  overlayMaskColor(20, 20, 20, 0.55),
)

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'confirm', blob: Blob): void
  (e: 'cancel'): void
  (e: 'reselect'): void
}>()

const DISPLAY = 320 // 画布显示边长（CSS 像素）
const dpr = typeof window !== 'undefined' ? Math.max(1, Math.min(2, window.devicePixelRatio || 1)) : 1

const canvasRef = ref<HTMLCanvasElement | null>(null)
const img = ref<HTMLImageElement | null>(null)
const imgW = ref(0)
const imgH = ref(0)
const fitScale = ref(1) // cover 适配的最小 scale
const scale = ref(1)
const tx = ref(0) // 图像中心相对画布中心的水平偏移（CSS px）
const ty = ref(0)

const loading = ref(false)
const errorMsg = ref('')

const objectUrl = ref<string | null>(null)
const dragging = ref(false)
const pointerStart = { x: 0, y: 0, tx: 0, ty: 0 }

// 双指 pinch 状态
const activePointers = new Map<number, { x: number; y: number }>()
let pinchStartDist = 0
let pinchStartScale = 1

const minScale = computed(() => fitScale.value)
const maxScale = computed(() => fitScale.value * 4)

function clampScale(v: number): number {
  return Math.max(minScale.value, Math.min(maxScale.value, v))
}

/** 拖动 / 缩放后约束图像中心偏移：保证画布始终被图像覆盖，无白边 */
function clampTranslate() {
  const halfShownW = (imgW.value * scale.value) / 2
  const halfShownH = (imgH.value * scale.value) / 2
  const limitX = Math.max(0, halfShownW - DISPLAY / 2)
  const limitY = Math.max(0, halfShownH - DISPLAY / 2)
  tx.value = Math.max(-limitX, Math.min(limitX, tx.value))
  ty.value = Math.max(-limitY, Math.min(limitY, ty.value))
}

function draw() {
  const canvas = canvasRef.value
  const im = img.value
  if (!canvas || !im) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.save()
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.scale(dpr, dpr)
  ctx.translate(DISPLAY / 2 + tx.value, DISPLAY / 2 + ty.value)
  ctx.scale(scale.value, scale.value)
  ctx.drawImage(im, -imgW.value / 2, -imgH.value / 2)
  ctx.restore()
}

async function loadFile(file: File) {
  loading.value = true
  errorMsg.value = ''
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
  const url = URL.createObjectURL(file)
  objectUrl.value = url
  const im = new Image()
  im.crossOrigin = 'anonymous'
  try {
    await new Promise<void>((resolve, reject) => {
      im.onload = () => resolve()
      im.onerror = () => reject(new Error('图片加载失败'))
      im.src = url
    })
    img.value = im
    imgW.value = im.naturalWidth
    imgH.value = im.naturalHeight
    fitScale.value = Math.max(DISPLAY / imgW.value, DISPLAY / imgH.value)
    scale.value = fitScale.value
    tx.value = 0
    ty.value = 0
    // 等待 canvas 渲染好
    await new Promise((r) => requestAnimationFrame(r))
    draw()
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '图片加载失败'
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.open, props.file] as const,
  async ([open, file]) => {
    if (open && file) {
      await loadFile(file)
    }
    if (!open) {
      // 关闭时清理 objectURL
      if (objectUrl.value) {
        URL.revokeObjectURL(objectUrl.value)
        objectUrl.value = null
      }
      img.value = null
    }
  },
  { immediate: true },
)

// ---- pointer events ----
function onPointerDown(e: PointerEvent) {
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (activePointers.size === 2) {
    const pts = Array.from(activePointers.values())
    pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
    pinchStartScale = scale.value
    dragging.value = false
  } else {
    dragging.value = true
    pointerStart.x = e.clientX
    pointerStart.y = e.clientY
    pointerStart.tx = tx.value
    pointerStart.ty = ty.value
  }
}
function onPointerMove(e: PointerEvent) {
  if (!activePointers.has(e.pointerId)) return
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (activePointers.size >= 2) {
    const pts = Array.from(activePointers.values())
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
    if (pinchStartDist > 0) {
      scale.value = clampScale(pinchStartScale * (dist / pinchStartDist))
      clampTranslate()
      draw()
    }
    return
  }
  if (!dragging.value) return
  tx.value = pointerStart.tx + (e.clientX - pointerStart.x)
  ty.value = pointerStart.ty + (e.clientY - pointerStart.y)
  clampTranslate()
  draw()
}
function onPointerUp(e: PointerEvent) {
  activePointers.delete(e.pointerId)
  if (activePointers.size < 2) {
    pinchStartDist = 0
  }
  if (activePointers.size === 0) {
    dragging.value = false
  }
}
function onWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = -e.deltaY * 0.0015
  scale.value = clampScale(scale.value * (1 + delta))
  clampTranslate()
  draw()
}

// ---- 操作按钮 ----
function close() {
  emit('update:open', false)
}
function onCancel() {
  emit('cancel')
  close()
}
function onReselect() {
  emit('reselect')
}
async function onConfirm() {
  const im = img.value
  if (!im) return
  const out = document.createElement('canvas')
  out.width = AVATAR_CROP_OUTPUT_PX
  out.height = AVATAR_CROP_OUTPUT_PX
  const ctx = out.getContext('2d')
  if (!ctx) return
  // 用与显示画布相同的几何变换，但缩放到输出尺寸
  const ratio = AVATAR_CROP_OUTPUT_PX / DISPLAY
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.translate(
    AVATAR_CROP_OUTPUT_PX / 2 + tx.value * ratio,
    AVATAR_CROP_OUTPUT_PX / 2 + ty.value * ratio,
  )
  ctx.scale(scale.value * ratio, scale.value * ratio)
  ctx.drawImage(im, -imgW.value / 2, -imgH.value / 2)
  const blob: Blob | null = await new Promise((resolve) =>
    out.toBlob((b) => resolve(b), 'image/jpeg', 0.92),
  )
  if (!blob) {
    errorMsg.value = '裁剪失败，请重试'
    return
  }
  emit('confirm', blob)
  close()
}

// ---- ESC ----
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
    if (v) {
      window.addEventListener('keydown', onKey)
      document.body.style.overflow = 'hidden'
    } else {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKey)
    document.body.style.overflow = ''
  }
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
})
</script>

<template>
  <Teleport to="body">
    <transition name="cropper-fade">
      <div
        v-if="open"
        class="cropper-mask"
        role="dialog"
        aria-modal="true"
        aria-label="裁剪头像"
        @click.self="onCancel"
      >
        <div class="cropper-card" @click.stop>
          <h3 class="cropper-title">裁剪头像</h3>

          <div class="cropper-stage">
            <canvas
              ref="canvasRef"
              class="cropper-canvas"
              :width="DISPLAY * dpr"
              :height="DISPLAY * dpr"
              :style="{ width: DISPLAY + 'px', height: DISPLAY + 'px' }"
              @pointerdown="onPointerDown"
              @pointermove="onPointerMove"
              @pointerup="onPointerUp"
              @pointercancel="onPointerUp"
              @wheel.passive="false"
              @wheel="onWheel"
            />
            <div v-if="loading" class="cropper-loading">载入中…</div>
            <div v-if="errorMsg" class="cropper-error">{{ errorMsg }}</div>
            <div class="cropper-frame" aria-hidden="true">
              <div class="frame-corner tl" />
              <div class="frame-corner tr" />
              <div class="frame-corner bl" />
              <div class="frame-corner br" />
            </div>
          </div>

          <div class="cropper-zoom">
            <span class="zoom-label">缩放</span>
            <input
              type="range"
              :min="minScale"
              :max="maxScale"
              :step="(maxScale - minScale) / 100 || 0.001"
              :value="scale"
              @input="
                (e) => {
                  scale = clampScale(Number((e.target as HTMLInputElement).value))
                  clampTranslate()
                  draw()
                }
              "
            />
          </div>

          <p class="cropper-hint">拖动调整位置，滚轮 / 双指缩放</p>

          <div class="cropper-actions">
            <button type="button" class="btn btn-cancel" @click="onCancel">取消</button>
            <button type="button" class="btn btn-reselect" @click="onReselect">重选</button>
            <button type="button" class="btn btn-ok" :disabled="!img || loading" @click="onConfirm">
              确认
            </button>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.cropper-mask {
  position: fixed;
  inset: 0;
  /* iOS safe-area 兜底（详见 main.css 注释） */
  min-height: 100vh;
  min-height: 100dvh;
  z-index: 8500;
  background: rgba(20, 20, 20, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  /* 用 max() 把 safe-area 纳入 padding，避免裁剪卡片被刘海或 home indicator 遮挡 */
  padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
}
.cropper-card {
  width: 100%;
  max-width: 380px;
  background: #fff;
  border-radius: 14px;
  padding: 18px 18px 14px;
  box-shadow: 0 12px 44px rgba(0, 0, 0, 0.22);
}
.cropper-title {
  font-size: 16px;
  font-weight: 600;
  color: #222;
  margin: 0 0 12px;
  text-align: center;
}
.cropper-stage {
  position: relative;
  width: 320px;
  height: 320px;
  margin: 0 auto;
  border-radius: 8px;
  overflow: hidden;
  background: #000;
  touch-action: none;
  user-select: none;
}
.cropper-canvas {
  display: block;
  cursor: grab;
}
.cropper-canvas:active {
  cursor: grabbing;
}
.cropper-loading,
.cropper-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 14px;
  background: rgba(0, 0, 0, 0.4);
  pointer-events: none;
}
.cropper-error {
  color: #ffb4b4;
}
.cropper-frame {
  position: absolute;
  inset: 0;
  pointer-events: none;
  border: 1px dashed rgba(255, 255, 255, 0.55);
}
.frame-corner {
  position: absolute;
  width: 18px;
  height: 18px;
  border-color: #fff;
  border-style: solid;
  border-width: 0;
}
.frame-corner.tl {
  top: 0;
  left: 0;
  border-top-width: 3px;
  border-left-width: 3px;
}
.frame-corner.tr {
  top: 0;
  right: 0;
  border-top-width: 3px;
  border-right-width: 3px;
}
.frame-corner.bl {
  bottom: 0;
  left: 0;
  border-bottom-width: 3px;
  border-left-width: 3px;
}
.frame-corner.br {
  bottom: 0;
  right: 0;
  border-bottom-width: 3px;
  border-right-width: 3px;
}
.cropper-zoom {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 4px 4px;
}
.zoom-label {
  font-size: 13px;
  color: #666;
  min-width: 32px;
}
.cropper-zoom input[type='range'] {
  flex: 1;
}
.cropper-hint {
  margin: 4px 0 14px;
  font-size: 12px;
  color: #999;
  text-align: center;
}
.cropper-actions {
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
.btn-reselect {
  background: #eef3ff;
  color: #3a5db3;
}
.btn-reselect:hover {
  background: #dde6fb;
}
.btn-ok {
  background: #4a8d5e;
  color: #fff;
}
.btn-ok:hover {
  background: #3f7a51;
}
.btn-ok:disabled {
  background: #b6c9bc;
  cursor: not-allowed;
}

.cropper-fade-enter-active,
.cropper-fade-leave-active {
  transition: opacity 0.2s ease;
}
.cropper-fade-enter-active .cropper-card,
.cropper-fade-leave-active .cropper-card {
  transition: transform 0.2s ease;
}
.cropper-fade-enter-from {
  opacity: 0;
}
.cropper-fade-enter-from .cropper-card {
  transform: translateY(10px) scale(0.97);
}
.cropper-fade-leave-to {
  opacity: 0;
}
.cropper-fade-leave-to .cropper-card {
  transform: scale(0.98);
}
</style>
