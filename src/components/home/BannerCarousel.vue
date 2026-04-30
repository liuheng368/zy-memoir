<script setup lang="ts">
/**
 * 合影轮播（plan M-② · spec §1.1 ② / §2 ② / Q5）
 *
 * 行为：
 *   - 自动轮播：4 s 间隔（spec Q5 区间 3~5 s 内取中位）
 *   - 手动：左右切换 + 圆点指示器
 *   - hover / focus 暂停自动播放
 *   - 空态：占位文案「敬请期待班级合影」
 *   - 加载态：渐变占位骨架，避免布局跳动
 *   - 错误态：与空态同样落到占位文案，并在 console 上报（不打扰用户）
 *
 * 数据：由 Home.vue 通过 props 传入；本组件不直接 import store。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { Banner } from '@/api/banners'
import type { SectionStatus } from '@/stores/classData'

const props = defineProps<{
  banners: Banner[]
  status: SectionStatus
}>()

const AUTO_PLAY_MS = 4000

const current = ref(0)
const isHover = ref(false)
let timer: number | null = null

const isReady = computed(() => props.status === 'ready')
const isLoading = computed(() => props.status === 'loading' || props.status === 'idle')
const isEmpty = computed(() => isReady.value && props.banners.length === 0)

function start() {
  stop()
  if (!isReady.value || props.banners.length <= 1) return
  timer = window.setInterval(() => {
    next()
  }, AUTO_PLAY_MS)
}

function stop() {
  if (timer != null) {
    window.clearInterval(timer)
    timer = null
  }
}

function next() {
  if (!props.banners.length) return
  current.value = (current.value + 1) % props.banners.length
}

function prev() {
  if (!props.banners.length) return
  current.value = (current.value - 1 + props.banners.length) % props.banners.length
}

function go(i: number) {
  if (i < 0 || i >= props.banners.length) return
  current.value = i
}

function onMouseEnter() {
  isHover.value = true
  stop()
}

function onMouseLeave() {
  isHover.value = false
  start()
}

watch(
  () => [props.banners.length, props.status, isHover.value],
  () => {
    // 防止 banners 长度变化后 current 越界
    if (current.value >= props.banners.length) current.value = 0
    if (!isHover.value) start()
  },
  { immediate: true },
)

onBeforeUnmount(() => stop())
</script>

<template>
  <section class="banner-carousel" @mouseenter="onMouseEnter" @mouseleave="onMouseLeave">
    <!-- 加载态 -->
    <div v-if="isLoading" class="state state-loading" aria-busy="true">
      <div class="skeleton"></div>
    </div>

    <!-- 空态 / 错误态 -->
    <div v-else-if="isEmpty || status === 'error'" class="state state-empty">
      <p class="empty-text">敬请期待班级合影</p>
      <p v-if="status === 'error'" class="empty-hint">网络出了点状况，稍后会自动重试</p>
    </div>

    <!-- 正常态 -->
    <div v-else class="viewport">
      <div
        v-for="(b, i) in banners"
        :key="b.id"
        class="slide"
        :class="{ active: i === current }"
        :aria-hidden="i === current ? 'false' : 'true'"
      >
        <img :src="b.url" :alt="b.caption ?? `合影 ${i + 1}`" loading="lazy" />
        <div v-if="b.caption" class="caption">{{ b.caption }}</div>
      </div>

      <!-- 控制 -->
      <button
        v-if="banners.length > 1"
        class="ctrl prev"
        type="button"
        aria-label="上一张"
        @click="prev"
      >
        ‹
      </button>
      <button
        v-if="banners.length > 1"
        class="ctrl next"
        type="button"
        aria-label="下一张"
        @click="next"
      >
        ›
      </button>

      <ol v-if="banners.length > 1" class="dots" role="tablist">
        <li v-for="(b, i) in banners" :key="b.id">
          <button
            type="button"
            class="dot"
            :class="{ active: i === current }"
            :aria-label="`第 ${i + 1} 张`"
            :aria-selected="i === current"
            role="tab"
            @click="go(i)"
          ></button>
        </li>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.banner-carousel {
  position: relative;
  width: 100%;
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--color-card);
  box-shadow: var(--shadow-sm);
  /* 16:9 容器避免布局跳动 */
  aspect-ratio: 16 / 9;
  max-height: 420px;
}

.state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 16px;
}

.state-loading .skeleton {
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    var(--color-primary-soft) 0%,
    #fff 50%,
    var(--color-primary-soft) 100%
  );
  background-size: 200% 100%;
  animation: skeleton-shine 1.4s ease-in-out infinite;
  border-radius: var(--radius-lg);
}

.state-empty {
  background: linear-gradient(135deg, #fff8f5 0%, var(--color-primary-soft) 100%);
}

.empty-text {
  margin: 0;
  font-size: 16px;
  color: var(--color-primary);
  font-weight: 600;
}

.empty-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--color-text-soft);
}

.viewport {
  position: absolute;
  inset: 0;
}

.slide {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 0.6s ease;
  pointer-events: none;
}

.slide.active {
  opacity: 1;
  pointer-events: auto;
}

.slide img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.caption {
  position: absolute;
  left: 16px;
  bottom: 32px;
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  backdrop-filter: blur(4px);
}

.ctrl {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.7);
  color: var(--color-primary);
  font-size: 20px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.18s ease;
}

.ctrl:hover {
  background: #fff;
}

.ctrl.prev {
  left: 12px;
}

.ctrl.next {
  right: 12px;
}

.dots {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 12px;
  display: flex;
  justify-content: center;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.6);
  padding: 0;
  cursor: pointer;
  transition: background 0.18s ease, transform 0.18s ease;
}

.dot.active {
  background: var(--color-primary);
  transform: scale(1.25);
}

@keyframes skeleton-shine {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

@media (max-width: 640px) {
  .banner-carousel {
    aspect-ratio: 4 / 3;
    border-radius: var(--radius-md);
  }
  .ctrl {
    width: 28px;
    height: 28px;
    font-size: 16px;
  }
}
</style>
