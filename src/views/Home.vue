<script setup lang="ts">
/**
 * 主页（plan §页面布局：4 区 / G5）
 *
 * 装配：
 *   ① HomeTopbar    —— 角色徽标 + 退出 / 去登录 / ⚙ 管理
 *   ② BannerCarousel —— 合影轮播（G3 mock，G7 切真接口）
 *   ③ TeacherSection + TeacherCard —— 老师风采 + 录音条占位
 *   ④ StudentWall   + StudentAvatar —— 36 位学生头像墙（spec Q6 错位）
 *
 * 行为：
 *   - onMounted 调 useClassDataStore().fetchAll() —— Promise.allSettled 并发拉
 *     三段，互不阻塞
 *   - 单段失败时由对应组件展示「重试」入口，本视图层不做全局错误屏
 *
 * 与登录浮层的关系：
 *   - 路由 `/`  → views/StudentLogin.vue 内部 `<Home />` + 学生登录浮层
 *   - 路由 `/teacher` → views/TeacherLogin.vue 内部 `<Home />` + 老师登录浮层
 *   - 因此 Home 不感知登录浮层 / mode；保持纯展示。
 */
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import HomeTopbar from '@/components/home/HomeTopbar.vue'
import BannerCarousel from '@/components/home/BannerCarousel.vue'
import TeacherSection from '@/components/home/TeacherSection.vue'
import StudentWall from '@/components/home/StudentWall.vue'
import { useClassDataStore } from '@/stores/classData'
import type { StudentSummary } from '@/api/students'
import type { TeacherFull } from '@/api/teachers'

const classData = useClassDataStore()
const { students, teachers, banners } = storeToRefs(classData)

onMounted(() => {
  // 并发拉三段；缓存命中时立刻返回
  void classData.fetchAll()
})

// G7 学生详情浮层 / G8 老师详情浮层暂未实装，先在 console 记录交互意图。
function handleStudentClick(s: StudentSummary) {
  console.info('[home] click student', s.id, s.name)
}

function handleTeacherClick(t: TeacherFull) {
  console.info('[home] click teacher', t.id, t.name)
}

function handleTeacherPlay(p: { teacher: TeacherFull; index: number }) {
  // G8 useAudioPlayer 接管；本期占位
  console.info('[home] play teacher recording', p.teacher.id, p.index)
}

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
