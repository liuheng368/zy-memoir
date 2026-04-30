<script setup lang="ts">
/**
 * 学生头像墙（plan M-④ · spec §1.1 ④ / §2 ④ / Q6 = 方案 A'）
 *
 * 布局：
 *   - 默认 8 列；< 768 px → 4 列
 *   - `grid-auto-flow: dense`，按 id 哈希让 ~⅙ 的单元格 `span 2`，
 *     得到「错落」错位效果；其余 cell 走 1×1
 *   - 子元素旋转 / 平移由 StudentAvatar.vue 自身根据 id 计算（保证刷新稳定）
 *
 * 主态：根据 auth.studentProfile?.studentId 与 student.id 比对决定 mode='owner'
 *
 * 数据源：由 Home.vue 通过 props 注入；空态 / 加载态独立分支
 */
import { computed } from 'vue'
import StudentAvatar from './StudentAvatar.vue'
import type { StudentSummary } from '@/api/students'
import type { SectionStatus } from '@/stores/classData'
import { useAuthStore } from '@/stores/auth'
import { TOTAL_STUDENTS } from '@/utils/constants'

const props = defineProps<{
  students: StudentSummary[]
  status: SectionStatus
}>()

const emit = defineEmits<{
  (e: 'click-student', student: StudentSummary): void
  (e: 'retry'): void
}>()

const auth = useAuthStore()

const ownerStudentId = computed(() => {
  if (auth.role !== 'student') return null
  return auth.studentProfile?.studentId ?? null
})

const showSkeleton = computed(() => props.status === 'loading' || props.status === 'idle')
const showError = computed(() => props.status === 'error')
const isEmpty = computed(() => props.status === 'ready' && props.students.length === 0)
const skeletonCount = TOTAL_STUDENTS

/**
 * 给每个学生计算一个 cell 类：
 *   - 大约每 6 张里挑 1 张 `wide`（span 2 列）；id 哈希稳定
 *   - 主态卡片强制 `wide`，让"自己"更突出
 */
function cellClass(s: StudentSummary): string {
  const isOwner = ownerStudentId.value === s.id
  if (isOwner) return 'cell wide owner'
  // 简单稳定哈希：id * 2654435761 (Knuth) 后 mod 6
  const h = ((s.id * 2654435761) >>> 0) % 6
  return h === 0 ? 'cell wide' : 'cell'
}

function modeFor(s: StudentSummary): 'owner' | 'visitor' {
  return ownerStudentId.value === s.id ? 'owner' : 'visitor'
}

function handleClick(s: StudentSummary) {
  emit('click-student', s)
}
</script>

<template>
  <section class="student-wall">
    <header class="section-head">
      <h2>学生头像墙</h2>
      <p class="subtitle">36 个独一无二的小朋友</p>
    </header>

    <!-- 加载骨架 -->
    <div v-if="showSkeleton" class="grid" aria-busy="true">
      <div v-for="i in skeletonCount" :key="i" class="cell">
        <div class="skel-card"></div>
      </div>
    </div>

    <!-- 错误 -->
    <div v-else-if="showError" class="state-error">
      <p>学生头像墙加载失败 ☁️</p>
      <button type="button" class="retry-btn" @click="emit('retry')">重试</button>
    </div>

    <!-- 空态 -->
    <div v-else-if="isEmpty" class="state-empty">
      <p>还没有学生记录</p>
    </div>

    <!-- 正常 -->
    <div v-else class="grid">
      <div v-for="s in students" :key="s.id" :class="cellClass(s)">
        <StudentAvatar :student="s" :mode="modeFor(s)" @click="handleClick" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.student-wall {
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

/* spec Q6 = 方案 A'：CSS Grid + dense + 部分单元格 span 2 */
.grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  grid-auto-flow: dense;
  gap: 12px;
}

.cell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cell.wide {
  grid-column: span 2;
  grid-row: span 2;
}

@media (max-width: 768px) {
  .grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }
}

@media (max-width: 360px) {
  .grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.skel-card {
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  background: linear-gradient(
    90deg,
    var(--color-primary-soft) 0%,
    #fff 50%,
    var(--color-primary-soft) 100%
  );
  background-size: 200% 100%;
  animation: skel-shine 1.4s ease-in-out infinite;
}

.state-error,
.state-empty {
  text-align: center;
  padding: 24px;
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

@keyframes skel-shine {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
