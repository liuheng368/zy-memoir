<script setup lang="ts">
/**
 * 老师风采区（plan M-③ · spec §1.1 ③ / §2 ③）
 *
 * 容器：3 张 `<TeacherCard />` 横向排列；< 640 px 自动 wrap
 * 加载态：3 张骨架卡片占位
 * 错误态：fallback 文案 + 重试钩子（重试动作交给 Home.vue → store.fetchTeachers(true)）
 *
 * 不订阅 store，由 Home.vue 通过 props 注入数据。
 */
import { computed } from 'vue'
import TeacherCard from './TeacherCard.vue'
import type { TeacherFull } from '@/api/teachers'
import type { SectionStatus } from '@/stores/classData'
import { TOTAL_TEACHERS } from '@/utils/constants'

const props = defineProps<{
  teachers: TeacherFull[]
  status: SectionStatus
}>()

const emit = defineEmits<{
  (e: 'retry'): void
  (e: 'click-avatar', teacher: TeacherFull): void
  (e: 'play-recording', payload: { teacher: TeacherFull; index: number }): void
}>()

const showSkeleton = computed(() => props.status === 'loading' || props.status === 'idle')
const showError = computed(() => props.status === 'error')
const isEmpty = computed(() => props.status === 'ready' && props.teachers.length === 0)
const skeletonCount = TOTAL_TEACHERS

function handleAvatar(t: TeacherFull) {
  emit('click-avatar', t)
}

function handlePlay(p: { teacher: TeacherFull; index: number }) {
  emit('play-recording', p)
}
</script>

<template>
  <section class="teacher-section">
    <header class="section-head">
      <h2>老师风采</h2>
      <p class="subtitle">陪伴二班三年的可爱大人</p>
    </header>

    <div v-if="showSkeleton" class="grid">
      <div v-for="i in skeletonCount" :key="i" class="skeleton-card" aria-hidden="true">
        <div class="skel-avatar"></div>
        <div class="skel-line"></div>
        <div class="skel-line short"></div>
      </div>
    </div>

    <div v-else-if="showError" class="state-error">
      <p>老师风采加载失败 ☁️</p>
      <button type="button" class="retry-btn" @click="emit('retry')">重试</button>
    </div>

    <div v-else-if="isEmpty" class="state-empty">
      <p>暂无老师信息</p>
    </div>

    <div v-else class="grid">
      <TeacherCard
        v-for="t in teachers"
        :key="t.id"
        :teacher="t"
        @click-avatar="handleAvatar"
        @play-recording="handlePlay"
      />
    </div>
  </section>
</template>

<style scoped>
.teacher-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 16px;
  background: var(--color-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.section-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 10px;
}

.section-head h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text);
}

.subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-soft);
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 640px) {
  .teacher-section {
    padding: 16px 12px;
    border-radius: var(--radius-md);
  }

  .grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
}

@media (max-width: 380px) {
  .teacher-section {
    padding: 14px 10px;
  }

  .grid {
    grid-template-columns: 1fr;
  }
}

.skeleton-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px 12px;
  background: var(--color-bg);
  border-radius: var(--radius-md);
}

.skel-avatar,
.skel-line {
  background: linear-gradient(
    90deg,
    var(--color-primary-soft) 0%,
    #fff 50%,
    var(--color-primary-soft) 100%
  );
  background-size: 200% 100%;
  animation: skel-shine 1.4s ease-in-out infinite;
  border-radius: 6px;
}

.skel-avatar {
  width: 88px;
  height: 88px;
  border-radius: 50%;
}

.skel-line {
  width: 70%;
  height: 12px;
}

.skel-line.short {
  width: 40%;
  height: 10px;
}

.state-error,
.state-empty {
  text-align: center;
  padding: 20px;
  color: var(--color-text-soft);
}

.retry-btn {
  margin-top: 10px;
  padding: 6px 16px;
  border-radius: 999px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.retry-btn:hover {
  background: #ff5f70;
}

@keyframes skel-shine {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
