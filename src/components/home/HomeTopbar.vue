<script setup lang="ts">
/**
 * 主页顶栏（plan M-① · spec §1.1 ④ / §2 ①）
 *
 * 内容：
 *   - 班级标题：钟园幼儿园 2024 届大二班 · 班级回忆录
 *   - 角色徽标：学生 / 老师 / 管理员 / 游客 / 未登录
 *   - 触发：
 *     · 游客 / 未登录 → 点徽标 = openLoginPanel（spec §2 ① 提示去登录入口）
 *     · 已登录       → 退出登录
 *     · admin        → ⚙ 管理（仅 admin 可见，spec §1.1 ④）
 *
 * 不订阅 classData，由 Home.vue 注入数据；自身仅读 auth store。
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
      return sp ? `学生 · ${sp.name}` : '学生'
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

/** 徽标是否可点（触发去登录入口） */
const badgeClickable = computed(() => auth.isGuest || auth.isUninitialized)

function handleBadgeClick() {
  if (badgeClickable.value) {
    auth.openLoginPanel()
  }
}

function handleLogout() {
  auth.logout()
}

function gotoAdmin() {
  router.push({ path: ROUTES.ADMIN })
}
</script>

<template>
  <header class="topbar">
    <h1 class="title">
      <span class="title-main">钟园幼儿园 2024 届大二班</span>
      <span class="title-sub">· 班级回忆录</span>
    </h1>

    <div class="actions">
      <button
        type="button"
        class="badge"
        :class="{ clickable: badgeClickable }"
        :data-role="auth.role ?? 'none'"
        :title="badgeClickable ? '点击去登录' : ''"
        :aria-label="badgeClickable ? `当前为 ${roleLabel}，点击去登录` : roleLabel"
        @click="handleBadgeClick"
      >
        {{ roleLabel }}
      </button>

      <button
        v-if="auth.isLoggedIn"
        type="button"
        class="link-btn"
        @click="handleLogout"
      >
        退出登录
      </button>

      <button
        v-if="auth.role === 'admin'"
        type="button"
        class="icon-btn admin-btn"
        title="管理后台"
        aria-label="进入管理后台"
        @click="gotoAdmin"
      >
        ⚙
      </button>
    </div>
  </header>
</template>

<style scoped>
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
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.title-main {
  white-space: nowrap;
}

.title-sub {
  color: var(--color-text-soft);
  font-size: 13px;
  font-weight: 500;
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.badge {
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  border: none;
  font-family: inherit;
  cursor: default;
  transition: background 0.18s ease, transform 0.18s ease;
}

.badge.clickable {
  cursor: pointer;
}

.badge.clickable:hover {
  background: #ffd1d6;
  transform: translateY(-1px);
}

.badge[data-role='admin'] {
  background: #fff7e6;
  color: #d48806;
}

.badge[data-role='guest'],
.badge[data-role='none'] {
  background: #f0f0f0;
  color: var(--color-text-soft);
}

.link-btn {
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 13px;
  padding: 4px 6px;
  border-radius: 6px;
}

.link-btn:hover {
  background: var(--color-primary-soft);
}

.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  font-size: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.admin-btn:hover {
  background: var(--color-primary);
  color: #fff;
}

@media (max-width: 640px) {
  .title {
    font-size: 14px;
  }
  .title-sub {
    font-size: 12px;
  }
}
</style>
