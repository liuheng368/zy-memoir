<script setup lang="ts">
/**
 * 主页骨架（G5 才填实）：① 顶栏 / ② 合影轮播 / ③ 老师风采 / ④ 学生头像墙
 *
 * 当前阶段（G3）：
 * - 仅渲染四个分区的 placeholder + 顶栏角色徽标
 * - 提供「退出登录」「去登录」按钮以验证 store 流转
 * - StudentLogin.vue / TeacherLogin.vue 在未登录时会在主页之上叠加登录浮层
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ROUTES } from '@/utils/constants'

const auth = useAuthStore()
const router = useRouter()

const roleLabel = computed(() => {
  switch (auth.role) {
    case 'student': {
      const sp = auth.studentProfile
      return sp ? `学生 · #${sp.studentId} ${sp.name}` : '学生'
    }
    case 'teacher': {
      const tp = auth.teacherProfile
      return tp ? `老师 · ${tp.name}` : '老师'
    }
    case 'admin':
      return '管理员'
    case 'guest':
      return '游客'
    default:
      return '未登录'
  }
})

function handleLogout() {
  auth.logout()
}

function gotoAdmin() {
  router.push({ path: ROUTES.ADMIN, query: { token: 'TODO-replace-with-real-token' } })
}
</script>

<template>
  <main class="home">
    <!-- ① 顶栏 -->
    <header class="topbar">
      <h1 class="title">钟园幼儿园 2024 届大二班 · 班级回忆录</h1>
      <div class="right">
        <span class="badge" :data-role="auth.role ?? 'none'">{{ roleLabel }}</span>
        <button v-if="auth.isLoggedIn || auth.isGuest" class="link-btn" @click="handleLogout">
          退出登录
        </button>
        <button v-if="auth.isGuest" class="link-btn" @click="auth.openLoginPanel">去登录</button>
        <button v-if="auth.role === 'admin'" class="link-btn" @click="gotoAdmin">⚙ 管理</button>
      </div>
    </header>

    <!-- ② 合影轮播 -->
    <section class="placeholder banner">
      <h2>② 合影轮播</h2>
      <p>G5 实现：BannerCarousel.vue（自动 + 手动 + 圆点指示器，空态占位）</p>
    </section>

    <!-- ③ 老师风采 -->
    <section class="placeholder teachers">
      <h2>③ 老师风采</h2>
      <p>G5 实现：TeacherSection.vue（3 张老师卡片 + 录音条）</p>
    </section>

    <!-- ④ 学生头像墙 -->
    <section class="placeholder students">
      <h2>④ 学生头像墙（36 人）</h2>
      <p>G5 实现：StudentWall.vue + StudentAvatar.vue（spec Q6 = 方案 A' Grid 错位 + 微抖动）</p>
    </section>
  </main>
</template>

<style scoped>
.home {
  min-height: 100vh;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.title {
  font-size: 16px;
  margin: 0;
  color: var(--color-text);
}

.right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.badge {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.badge[data-role='admin'] {
  background: #fff7e6;
  color: #d48806;
}

.badge[data-role='guest'] {
  background: #f0f0f0;
  color: var(--color-text-soft);
}

.link-btn {
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 13px;
  padding: 4px 6px;
}

.placeholder {
  background: var(--color-card);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: 24px 16px;
  text-align: center;
  color: var(--color-text-soft);
}

.placeholder h2 {
  margin: 0 0 8px;
  font-size: 15px;
  color: var(--color-text);
}

.placeholder p {
  margin: 0;
  font-size: 13px;
}
</style>
