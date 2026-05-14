<script setup lang="ts">
/**
 * 学生头像（plan M-④ 子件 · spec §1.1 ④ / Q6 = 方案 A'）
 *
 * 视觉：
 *   - 圆角方形头像（aspect-ratio: 1）
 *   - 缺省头像 → 首字符渐变色块（粉/蓝按性别）
 *   - 按 id 稳定哈希加 ±4° 旋转 + ±8 px 平移，避免方阵呆板
 *   - 主态 (mode='owner') 加 emoji 角标 / 高亮边
 *
 * 主态判定：
 *   - 由 StudentWall.vue / Home.vue 计算 mode = 'owner' | 'visitor' 后传入
 *   - 本组件不读 auth（解耦，便于单测 / Storybook 化）
 *
 * 不渲染学号（spec Q-LAYOUT 决议）
 */
import { computed, ref } from 'vue'
import type { StudentSummary } from '@/api/students'
import { defaultStudentAvatar } from '@/utils/defaultAvatar'
import { proxiedMediaUrl } from '@/utils/mediaUrl'

const props = withDefaults(
  defineProps<{
    student: StudentSummary
    mode?: 'owner' | 'visitor'
    /** 是否启用错位旋转 + 平移；StudentWall 加载态时关闭以免视觉抖动 */
    jitter?: boolean
  }>(),
  { mode: 'visitor', jitter: true },
)

defineEmits<{
  (e: 'click', student: StudentSummary): void
}>()

/**
 * 简易稳定哈希：根据 id 生成 [-1, 1] 范围内的两个伪随机值，
 * 同一 id 在每次渲染都得到相同结果，保证刷新后位置不抖动。
 */
function pseudoRand(id: number, salt: number): number {
  // 经典 32-bit mix
  let x = id * 374761393 + salt * 668265263
  x = (x ^ (x >>> 13)) >>> 0
  x = (x * 1274126177) >>> 0
  x = (x ^ (x >>> 16)) >>> 0
  // 映射到 [-1, 1]
  return (x / 0xffffffff) * 2 - 1
}

const tilt = computed(() => {
  if (!props.jitter) return { rotate: 0, x: 0, y: 0 }
  const rotate = pseudoRand(props.student.id, 1) * 4 // ±4°
  const x = pseudoRand(props.student.id, 2) * 8 // ±8 px
  const y = pseudoRand(props.student.id, 3) * 8
  return { rotate, x, y }
})

const transformStyle = computed(() => {
  const t = tilt.value
  return {
    transform: `translate(${t.x.toFixed(2)}px, ${t.y.toFixed(2)}px) rotate(${t.rotate.toFixed(2)}deg)`,
  }
})

/**
 * 头像 src 兜底链：用户上传 → 默认 SVG（按性别）。
 * 用 `<img>` 统一渲染，避免「文字色块 / 真照片」两套渲染分支。
 */
const avatarSrc = computed(
  () => proxiedMediaUrl(props.student.avatar?.url) || defaultStudentAvatar(props.student.gender),
)
/** 是否为默认 SVG（用于关闭淡入动画 — SVG 加载几乎瞬时） */
const isDefault = computed(() => !props.student.avatar?.url)

const genderClass = computed(() => `gender-${props.student.gender || 'unknown'}`)

/** 真照片 onload 后才显形（plan G11 头像墙首屏并发优化） */
const loaded = ref(false)
function onImgLoad() {
  loaded.value = true
}
function onImgError() {
  // 加载失败 → fallback 到默认 SVG
  loaded.value = true
}

const ariaLabel = computed(() => {
  const role = props.mode === 'owner' ? '（这是你）' : ''
  const counts = `照片 ${props.student.photoCount} / 录音 ${props.student.recordingCount}`
  return `${props.student.name}${role} · ${counts}`
})
</script>

<template>
  <button
    type="button"
    class="student-avatar"
    :class="[genderClass, { owner: mode === 'owner' }]"
    :style="transformStyle"
    :aria-label="ariaLabel"
    @click="$emit('click', student)"
  >
    <div class="avatar-inner">
      <img
        :src="avatarSrc"
        :alt="student.name"
        :class="{ loaded: loaded || isDefault }"
        loading="lazy"
        decoding="async"
        @load="onImgLoad"
        @error="onImgError"
      />

      <!-- 主态角标 -->
      <span v-if="mode === 'owner'" class="owner-badge" aria-hidden="true">★</span>
    </div>
    <p class="name">{{ student.name }}</p>

    <!-- 计数小尾巴：照片 / 录音；为 0 时不渲染，保持简洁 -->
    <p v-if="student.photoCount || student.recordingCount" class="counts" aria-hidden="true">
      <span v-if="student.photoCount" class="count-photo">📷 {{ student.photoCount }}</span>
      <span v-if="student.recordingCount" class="count-rec">🎙 {{ student.recordingCount }}</span>
    </p>
  </button>
</template>

<style scoped>
.student-avatar {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: none;
  border: none;
  cursor: pointer;
  transition: transform 0.18s ease;
  /* 单元格内尺寸 */
  width: 100%;
}

.student-avatar:hover {
  /* hover 时回正且放大，强调选中可读 */
  transform: scale(1.08) rotate(0) !important;
  z-index: 2;
}

.avatar-inner {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: clamp(20px, 6vw, 32px);
  font-weight: 600;
  border: 2px solid #fff;
  box-shadow: var(--shadow-sm);
}

.gender-female .avatar-inner {
  background: linear-gradient(135deg, #ffd1d6 0%, #ff7e8b 100%);
}

.gender-male .avatar-inner {
  background: linear-gradient(135deg, #c5e3ff 0%, #4a90e2 100%);
}

.gender-unknown .avatar-inner {
  background: linear-gradient(135deg, #e0e0e0 0%, #909090 100%);
}

.avatar-inner img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* 头像墙懒加载 + 渐显，避免 36 张同时切换造成抖动（plan G11） */
  opacity: 0;
  transition: opacity 0.32s ease;
}
.avatar-inner img.loaded {
  opacity: 1;
}

.owner .avatar-inner {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft), var(--shadow-sm);
}

.owner-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
}

.name {
  margin: 0;
  font-size: 12px;
  color: var(--color-text);
  font-weight: 500;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.counts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin: 0;
  font-size: 10px;
  color: var(--color-text-soft);
  max-width: 100%;
}

@media (max-width: 360px) {
  .student-avatar {
    gap: 3px;
    padding: 3px;
  }

  .name {
    font-size: 11px;
  }

  .counts {
    gap: 4px;
  }
}
</style>
