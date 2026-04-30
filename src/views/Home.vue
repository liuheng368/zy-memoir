<script setup lang="ts">
/**
 * 主页（plan §页面布局：4 区 / G5）
 *
 * 装配：
 *   ① HomeTopbar    —— 角色徽标 + 退出 / 去登录 / ⚙ 管理
 *   ② BannerCarousel —— 合影轮播（G3 mock，G7 切真接口）
 *   ③ TeacherSection + TeacherCard —— 老师风采 + 录音条（G4 起接通 useAudioPlayer）
 *   ④ StudentWall   + StudentAvatar —— 36 位学生头像墙（spec Q6 错位）
 *
 * 行为（G4 起）：
 *   - onMounted 调 useClassDataStore().fetchAll() —— Promise.allSettled 并发拉
 *     三段，互不阻塞
 *   - 点学生头像 → 打开 <StudentOverlay>；登录学生点自己 → owner 模式，否则 visitor
 *   - 点老师头像 → 仅"登录老师点自己"才打开 <TeacherOverlay>（owner 模式）；
 *     其它角色（学生 / 游客 / admin）按 spec Q-TEACHER-OTHER 默认决议**不**打开
 *     教师浮层（仍可通过老师卡片上的录音条直接听）
 *
 * 与登录浮层的关系：
 *   - 路由 `/`  → views/StudentLogin.vue 内部 `<Home />` + 学生登录浮层
 *   - 路由 `/teacher` → views/TeacherLogin.vue 内部 `<Home />` + 老师登录浮层
 *   - 因此 Home 不感知登录浮层 / mode；保持纯展示。
 */
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import HomeTopbar from '@/components/home/HomeTopbar.vue'
import BannerCarousel from '@/components/home/BannerCarousel.vue'
import TeacherSection from '@/components/home/TeacherSection.vue'
import StudentWall from '@/components/home/StudentWall.vue'
import StudentOverlay from '@/components/overlays/StudentOverlay.vue'
import TeacherOverlay from '@/components/overlays/TeacherOverlay.vue'
import { useClassDataStore } from '@/stores/classData'
import { useAuthStore } from '@/stores/auth'
import type { StudentSummary } from '@/api/students'
import type { TeacherFull } from '@/api/teachers'

const classData = useClassDataStore()
const { students, teachers, banners } = storeToRefs(classData)
const authStore = useAuthStore()
const { role, studentProfile, teacherProfile } = storeToRefs(authStore)

onMounted(() => {
  // 并发拉三段；缓存命中时立刻返回
  void classData.fetchAll()
})

/* ---------------- 学生浮层 ---------------- */
const studentOverlayOpen = ref(false)
const currentStudentId = ref<number | null>(null)
const studentOverlayMode = computed<'owner' | 'visitor'>(() => {
  if (
    role.value === 'student' &&
    studentProfile.value?.studentId === currentStudentId.value
  ) {
    return 'owner'
  }
  return 'visitor'
})

function handleStudentClick(s: StudentSummary): void {
  currentStudentId.value = s.id
  studentOverlayOpen.value = true
}

function onStudentOverlayUpdated(): void {
  // 数据变更后刷新学生列表（更新照片 / 录音计数 + 头像缩略图）
  void classData.fetchStudents(true)
}

/* ---------------- 老师浮层 ---------------- */
const teacherOverlayOpen = ref(false)
const currentTeacherId = ref<number | null>(null)
const teacherOverlayMode = computed<'owner' | 'visitor'>(() => {
  if (
    role.value === 'teacher' &&
    teacherProfile.value?.teacherId === currentTeacherId.value
  ) {
    return 'owner'
  }
  return 'visitor'
})

function handleTeacherClick(t: TeacherFull): void {
  // spec Q-TEACHER-OTHER 决议：默认仅老师本人可打开浮层；其他角色不开浮层
  if (
    role.value === 'teacher' &&
    teacherProfile.value?.teacherId === t.id
  ) {
    currentTeacherId.value = t.id
    teacherOverlayOpen.value = true
  }
}

function onTeacherOverlayUpdated(): void {
  void classData.fetchTeachers(true)
}

function handleTeacherPlay(_p: { teacher: TeacherFull; index: number }): void {
  // useAudioPlayer 已在 TeacherCard 内直接调用；这里仅留 hook（未来埋点）
}

/* ---------------- 拉取重试 ---------------- */
function retryTeachers() {
  void classData.fetchTeachers(true)
}

function retryStudents() {
  void classData.fetchStudents(true)
}
</script>

<template>
  <main class="home">
    <HomeTopbar />

    <BannerCarousel :banners="banners.data" :status="banners.status" />

    <TeacherSection
      :teachers="teachers.data"
      :status="teachers.status"
      @retry="retryTeachers"
      @click-avatar="handleTeacherClick"
      @play-recording="handleTeacherPlay"
    />

    <StudentWall
      :students="students.data"
      :status="students.status"
      @retry="retryStudents"
      @click-student="handleStudentClick"
    />

    <StudentOverlay
      v-model:open="studentOverlayOpen"
      :student-id="currentStudentId"
      :mode="studentOverlayMode"
      @updated="onStudentOverlayUpdated"
    />

    <TeacherOverlay
      v-model:open="teacherOverlayOpen"
      :teacher-id="currentTeacherId"
      :mode="teacherOverlayMode"
      @updated="onTeacherOverlayUpdated"
    />
  </main>
</template>

<style scoped>
.home {
  min-height: 100vh;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1200px;
  margin: 0 auto;
}

@media (max-width: 640px) {
  .home {
    padding: 12px;
    gap: 12px;
  }
}
</style>
