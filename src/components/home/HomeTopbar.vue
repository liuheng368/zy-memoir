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
 *     · ⚙ 多语义按钮（v0.7）：
 *         - 学生（v0.7 新增）→ emit('open-self-editor')，由 Home.vue 打开自己的 StudentOverlay
 *         - 老师 / 管理员 → 跳 `/admin` 路由（v0.6 行为不变）
 *         - 游客 / 未初始化 → 完全不渲染
 *       图标视觉沿用同一个 ⚙；title / aria-label 按角色文案区分
 *
 * G11 新增：游客 / 未登录态的「去登录」气泡（plan G11 视觉打磨）
 *   - mount 后 800 ms 首次自动浮现一次（避免与初次内容渲染抢焦点）
 *   - 6 s 自动收（不打断浏览）；用户也可点 ✕ 立即收
 *   - sessionStorage `zy-guest-tip-dismissed` 记忆，本会话不再自动弹
 *   - 用户主动点徽标也算「不再提示」（说明已经感知）
 *
 * 不订阅 classData，由 Home.vue 注入数据；自身仅读 auth store。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ROUTES } from '@/utils/constants'

const emit = defineEmits<{
  /** v0.7：学生点 ⚙ → 由 Home.vue 调 handleStudentClick(self) 打开自己浮层 */
  (e: 'open-self-editor'): void
}>()

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

/* -------------------- G11 游客气泡 -------------------- */
const TIP_KEY = 'zy-guest-tip-dismissed'
const TIP_FIRST_DELAY = 800
const TIP_AUTO_HIDE = 6000

const showGuestTip = ref(false)
let firstShowTimer: ReturnType<typeof setTimeout> | null = null
let autoHideTimer: ReturnType<typeof setTimeout> | null = null

function tipAlreadyDismissed(): boolean {
  if (typeof sessionStorage === 'undefined') return false
  try {
    return sessionStorage.getItem(TIP_KEY) === '1'
  } catch {
    return false
  }
}

function rememberTipDismissed(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(TIP_KEY, '1')
  } catch {
    /* 隐私模式可能抛 QuotaExceededError，忽略即可 */
  }
}

function scheduleAutoHide(): void {
  if (autoHideTimer) clearTimeout(autoHideTimer)
  autoHideTimer = setTimeout(() => {
    showGuestTip.value = false
  }, TIP_AUTO_HIDE)
}

function openTip(): void {
  if (!badgeClickable.value) return
  if (tipAlreadyDismissed()) return
  showGuestTip.value = true
  scheduleAutoHide()
}

function dismissTip(remember = true): void {
  showGuestTip.value = false
  if (autoHideTimer) {
    clearTimeout(autoHideTimer)
    autoHideTimer = null
  }
  if (remember) rememberTipDismissed()
}

function handleBadgeClick() {
  if (!badgeClickable.value) return
  // 点 badge 同时算作"已感知" → 收气泡 + 立即开登录面板
  dismissTip(true)
  auth.openLoginPanel()
}

function handleTipLogin() {
  dismissTip(true)
  auth.openLoginPanel()
}

function handleLogout() {
  auth.logout()
}

/* -------------------- v0.7 ⚙ 多语义入口 -------------------- */
/** 老师 / 管理员可见（v0.6） — 跳 /admin 主页合影管理 */
const canSeeAdminGear = computed(() => auth.canManageBanners)
/** 学生可见（v0.7） — emit 给 Home.vue 打开自己的 StudentOverlay owner 模式 */
const canSeeStudentGear = computed(
  () => auth.role === 'student' && !!auth.studentProfile?.studentId,
)
/** ⚙ 总开关：任一分支命中即渲染 */
const showGearBtn = computed(() => canSeeAdminGear.value || canSeeStudentGear.value)
/** 文案：学生「我的设置」；老师 / 管理员「主页合影管理」 */
const gearTitle = computed(() =>
  canSeeStudentGear.value ? '我的设置' : '主页合影管理',
)
const gearAriaLabel = computed(() =>
  canSeeStudentGear.value ? '打开我的设置' : '进入主页合影管理',
)

function handleGearClick() {
  if (canSeeStudentGear.value) {
    // 学生 v0.7 分支：让 Home.vue 用 auth.studentProfile.studentId 打开自己浮层
    emit('open-self-editor')
    return
  }
  // 老师 / 管理员（v0.6）：跳路由
  router.push({ path: ROUTES.ADMIN })
}

onMounted(() => {
  if (!badgeClickable.value) return
  if (tipAlreadyDismissed()) return
  firstShowTimer = setTimeout(openTip, TIP_FIRST_DELAY)
})

// 角色变化（如刚登录 / 刚 logout）→ 立刻收气泡，避免态错位
watch(badgeClickable, (now) => {
  if (!now) dismissTip(false)
})

onBeforeUnmount(() => {
  if (firstShowTimer) clearTimeout(firstShowTimer)
  if (autoHideTimer) clearTimeout(autoHideTimer)
})
</script>

<template>
  <header class="topbar">
    <h1 class="title">
      <span class="title-main">钟园幼儿园 2024 届大二班</span>
      <span class="title-sub">· 班级回忆录</span>
    </h1>

    <div class="actions">
      <div class="badge-wrap">
        <button
          type="button"
          class="badge"
          :class="{ clickable: badgeClickable, pulse: badgeClickable }"
          :data-role="auth.role ?? 'none'"
          :title="badgeClickable ? '点击去登录' : ''"
          :aria-label="badgeClickable ? `当前为 ${roleLabel}，点击去登录` : roleLabel"
          @click="handleBadgeClick"
        >
          {{ roleLabel }}
        </button>

        <transition name="tip-pop">
          <div
            v-if="showGuestTip && badgeClickable"
            class="guest-tip"
            role="status"
            aria-live="polite"
          >
            <button
              type="button"
              class="guest-tip-close"
              aria-label="不再提示"
              @click="dismissTip(true)"
            >
              ×
            </button>
            <p class="guest-tip-text">登录后可看见自己/同学/老师的回忆 ✿</p>
            <button type="button" class="guest-tip-cta" @click="handleTipLogin">
              去登录
            </button>
          </div>
        </transition>
      </div>

      <button
        v-if="auth.isLoggedIn"
        type="button"
        class="link-btn"
        @click="handleLogout"
      >
        退出登录
      </button>

      <button
        v-if="showGearBtn"
        type="button"
        class="icon-btn admin-btn"
        :title="gearTitle"
        :aria-label="gearAriaLabel"
        @click="handleGearClick"
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
  flex: 1 1 260px;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  min-width: 0;
}

.title-main {
  white-space: normal;
}

.title-sub {
  color: var(--color-text-soft);
  font-size: 13px;
  font-weight: 500;
}

.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}

.badge-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
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

/* G11：游客 / 未登录态轻微"脉冲"，提示徽标可点 */
.badge.pulse {
  position: relative;
  animation: badge-pulse 2.6s ease-in-out 1.6s infinite;
}
.badge.pulse::after {
  content: '';
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff4d4f;
  box-shadow: 0 0 0 2px var(--color-card);
}

@keyframes badge-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.045);
  }
}

@media (prefers-reduced-motion: reduce) {
  .badge.pulse {
    animation: none;
  }
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

/* G11 「去登录」气泡 popover */
.guest-tip {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 50;
  min-width: 200px;
  max-width: 240px;
  padding: 10px 12px 12px;
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  color: var(--color-text);
  font-size: 12px;
  line-height: 1.5;
}

.guest-tip::before {
  /* 三角小尖角 */
  content: '';
  position: absolute;
  top: -6px;
  right: 18px;
  width: 12px;
  height: 12px;
  background: var(--color-card);
  border-left: 1px solid var(--color-border);
  border-top: 1px solid var(--color-border);
  transform: rotate(45deg);
}

.guest-tip-close {
  position: absolute;
  top: 2px;
  right: 4px;
  width: 22px;
  height: 22px;
  background: none;
  border: none;
  color: var(--color-text-soft);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.guest-tip-close:hover {
  color: var(--color-text);
}

.guest-tip-text {
  margin: 0 16px 8px 0;
  color: var(--color-text);
}

.guest-tip-cta {
  appearance: none;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 12px;
  padding: 6px 14px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.guest-tip-cta:hover {
  background: var(--color-primary-strong, #3f7a51);
}

.tip-pop-enter-active,
.tip-pop-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.tip-pop-enter-from,
.tip-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.96);
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
  .topbar {
    align-items: flex-start;
    padding: 12px;
  }

  .title {
    font-size: 14px;
  }

  .title-sub {
    font-size: 12px;
  }

  .actions {
    width: 100%;
    justify-content: space-between;
    gap: 8px;
  }

  .guest-tip {
    position: fixed;
    top: auto;
    right: 12px;
    bottom: calc(16px + env(safe-area-inset-bottom));
    left: 12px;
    min-width: 0;
    max-width: none;
  }

  .guest-tip::before {
    display: none;
  }

  .link-btn {
    padding: 6px 8px;
  }
}
</style>
