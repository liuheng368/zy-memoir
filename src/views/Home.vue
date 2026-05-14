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
 *   - 点学生头像 → 打开 <StudentOverlay>；登录学生点自己 / 管理员 → owner 模式，否则 visitor
 *   - 点老师头像 → 打开 <TeacherOverlay>；登录老师点自己 / 管理员 → owner 模式（可换头像/增删录音），
 *     其它角色（学生 / 游客 / 其他老师） → visitor 模式（仅头像 + 录音播放，
 *     所有编辑入口隐藏）。
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
  if (role.value === 'admin') return 'owner'
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

/**
 * v0.7：HomeTopbar 顶栏 ⚙ → 学生「我的设置」入口
 * 直接以 owner 模式打开自己的浮层（等价于在头像墙上点到自己）。
 * mode 由 studentOverlayMode computed 自动判定为 'owner'：
 *   role==='student' && studentProfile.studentId === currentStudentId
 */
function openSelfStudentEditor(): void {
  if (role.value !== 'student') return
  const sid = studentProfile.value?.studentId
  if (!sid) return
  currentStudentId.value = sid
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
  if (role.value === 'admin') return 'owner'
  if (
    role.value === 'teacher' &&
    teacherProfile.value?.teacherId === currentTeacherId.value
  ) {
    return 'owner'
  }
  return 'visitor'
})

function handleTeacherClick(t: TeacherFull): void {
  // spec Q-TEACHER-OTHER 方案 B：所有人可点开老师浮层；
  // owner / visitor 模式由 teacherOverlayMode computed + TeacherOverlay 内部
  // effectiveMode 双重保险判定，编辑按钮在 visitor 模式下统一隐藏。
  currentTeacherId.value = t.id
  teacherOverlayOpen.value = true
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
    <HomeTopbar @open-self-editor="openSelfStudentEditor" />

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
  min-height: 100dvh;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 1200px;
  margin: 0 auto;
}

@media (max-width: 640px) {
  .home {
    padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom));
    gap: 12px;
  }
}

@media (max-width: 380px) {
  .home {
    padding-left: 8px;
    padding-right: 8px;
    gap: 10px;
  }
}
</style>
