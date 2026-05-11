<script setup lang="ts">
/**
 * 路由 `/teacher` 老师入口（plan v0.3 + G4b 实质化）：
 *   - 始终渲染 `<Home />` 作为底层视图
 *   - 未登录 / 主动「去登录」时叠加老师登录浮层（单选下拉 → teacherLogin）
 *   - 进入浮层时单次拉 `listTeachers` 取下拉数据
 *   - 浮层底部 `<LoginSkipFooter />`（G4c）
 *   - 浮层内**不**提供任何指向 `/` 的入口（v0.3 决议 Q-PLAN-17 / AC-18）
 */
import { computed, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import {
  teacherLogin,
  listTeachers,
  AuthApiError,
  type AuthErrorCode,
  type TeacherListItem,
} from '@/api/auth'
import LoginSkipFooter from '@/components/LoginSkipFooter.vue'
import Home from './Home.vue'

const auth = useAuthStore()

const overlayVisible = computed(() => {
  if (auth.isUninitialized) return true
  if (auth.role === 'teacher') return false
  if (auth.role === 'student' || auth.role === 'admin') return false
  if (auth.isGuest) return auth.showLoginPanel
  return false
})

const teachers = ref<TeacherListItem[]>([])
const loadingList = ref(false)
const listError = ref('')
const selectedId = ref<number | ''>('')
const submitting = ref(false)
const errorMsg = ref('')

const ROLE_LABEL: Record<TeacherListItem['role'], string> = {
  lead: '主班老师',
  assistant: '副班老师',
  life: '生活老师',
}

const ERROR_TEXT: Record<AuthErrorCode, string> = {
  INVALID_INPUT: '请选择老师',
  STUDENT_NOT_FOUND: '学号不存在',
  NAME_MISMATCH: '学号与姓名不一致',
  TEACHER_NOT_FOUND: '老师不存在',
  INVALID_TOKEN: 'token 无效',
  EXPIRED_TOKEN: 'token 已过期',
  SERVER_MISCONFIG: '服务端未配置（请联系管理员）',
  LIST_ERROR: '老师名单加载失败',
  UNKNOWN: '登录失败，请稍后重试',
}

async function fetchTeachers() {
  if (teachers.value.length) return
  loadingList.value = true
  listError.value = ''
  try {
    teachers.value = await listTeachers()
  } catch (e) {
    if (e instanceof AuthApiError) {
      listError.value = ERROR_TEXT[e.code] ?? e.message
    } else {
      listError.value = (e as Error)?.message || '老师名单加载失败'
    }
  } finally {
    loadingList.value = false
  }
}

// 浮层显示时再拉名单（避免页面常驻请求）
watch(
  overlayVisible,
  (visible) => {
    if (visible) void fetchTeachers()
  },
  { immediate: true },
)

async function handleSubmit() {
  errorMsg.value = ''
  if (typeof selectedId.value !== 'number') {
    errorMsg.value = '请选择老师'
    return
  }
  submitting.value = true
  try {
    const res = await teacherLogin({ teacherId: selectedId.value })
    auth.setTeacher(res)
    selectedId.value = ''
  } catch (e) {
    if (e instanceof AuthApiError) {
      errorMsg.value = ERROR_TEXT[e.code] ?? e.message
    } else {
      errorMsg.value = (e as Error)?.message || '网络异常，请稍后重试'
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="teacher-route">
    <Home />

    <Teleport to="body">
      <Transition name="overlay">
        <div v-if="overlayVisible" class="overlay-mask" role="dialog" aria-modal="true">
          <div class="overlay-card">
            <h2 class="overlay-title">钟园幼儿园 2024 届大二班</h2>
            <p class="overlay-sub">老师入口 · 请选择您的姓名</p>

            <form class="login-form" @submit.prevent="handleSubmit">
              <p v-if="loadingList" class="hint">加载老师名单…</p>
              <p v-else-if="listError" class="error" role="alert">{{ listError }}</p>
              <div v-else class="teacher-list" role="radiogroup" aria-label="选择老师">
                <label
                  v-for="t in teachers"
                  :key="t.id"
                  class="teacher-option"
                  :class="{ active: selectedId === t.id }"
                >
                  <input
                    v-model="selectedId"
                    type="radio"
                    :value="t.id"
                    name="teacher"
                    :disabled="submitting"
                  />
                  <span class="teacher-name">{{ t.name }}</span>
                  <span class="teacher-role">{{ ROLE_LABEL[t.role] ?? t.role }}</span>
                </label>
              </div>

              <p v-if="errorMsg" class="error" role="alert">{{ errorMsg }}</p>

              <button
                type="submit"
                class="primary"
                :disabled="submitting || loadingList || !!listError || teachers.length === 0"
              >
                {{ submitting ? '登录中…' : '进入' }}
              </button>
            </form>

            <LoginSkipFooter />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.overlay-mask {
  position: fixed;
  inset: 0;
  /* iOS safe-area 兜底（详见 main.css 注释） */
  min-height: 100vh;
  min-height: 100dvh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  /* iOS 上 padding 用 max() 包裹安全区，避免卡片被刘海或 home indicator 遮挡 */
  padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
}

.overlay-card {
  width: 100%;
  max-width: 380px;
  background: var(--color-card);
  border-radius: var(--radius-lg);
  padding: 24px 20px;
  box-shadow: var(--shadow-md);
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: center;
}

.overlay-title {
  margin: 0;
  font-size: 16px;
  color: var(--color-text);
}

.overlay-sub {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-soft);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: left;
}

.hint {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-soft);
  text-align: center;
}

.teacher-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.teacher-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.teacher-option:hover {
  border-color: var(--color-primary);
}

.teacher-option.active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft, #eef5ff);
}

.teacher-name {
  flex: 1;
  font-size: 14px;
  color: var(--color-text);
}

.teacher-role {
  font-size: 12px;
  color: var(--color-text-soft);
}

.error {
  margin: 0;
  font-size: 12px;
  color: #d4380d;
  text-align: center;
}

.primary {
  margin-top: 4px;
  padding: 10px 24px;
  border: none;
  border-radius: 999px;
  background: var(--color-primary);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.2s ease;
}

.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}
</style>
