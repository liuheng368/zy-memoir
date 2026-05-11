<script setup lang="ts">
/**
 * 路由 `/` 学生入口（plan v0.3 + G4a 实质化）：
 *   - 始终渲染 `<Home />` 作为底层视图
 *   - 未登录 / 主动「去登录」时叠加学生登录浮层（学号 + 姓名）
 *   - 浮层底部 `<LoginSkipFooter />`（G4c），仅承载「↪ 跳过登录」
 *   - 浮层内**不**提供任何指向 `/teacher` 的入口（v0.3 决议 Q-PLAN-17 / AC-18）
 */
import { computed, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { studentLogin, AuthApiError, type AuthErrorCode } from '@/api/auth'
import LoginSkipFooter from '@/components/LoginSkipFooter.vue'
import Home from './Home.vue'

const auth = useAuthStore()

/** 是否显示登录浮层：未初始化 → 弹；游客 + 主动点「去登录」→ 弹；其它情况不弹 */
const overlayVisible = computed(() => {
  if (auth.isUninitialized) return true
  if (auth.role === 'student') return false
  if (auth.role === 'teacher' || auth.role === 'admin') return false
  if (auth.isGuest) return auth.showLoginPanel
  return false
})

const studentIdInput = ref('')
const nameInput = ref('')
const submitting = ref(false)
const errorMsg = ref('')

const ERROR_TEXT: Record<AuthErrorCode, string> = {
  INVALID_INPUT: '请检查学号与姓名',
  STUDENT_NOT_FOUND: '学号不存在，请联系老师确认',
  NAME_MISMATCH: '学号与姓名不一致',
  TEACHER_NOT_FOUND: '老师不存在',
  INVALID_TOKEN: 'token 无效',
  EXPIRED_TOKEN: 'token 已过期',
  SERVER_MISCONFIG: '服务端未配置（请联系管理员）',
  LIST_ERROR: '名单加载失败',
  UNKNOWN: '登录失败，请稍后重试',
}

async function handleSubmit() {
  errorMsg.value = ''
  const sidRaw = studentIdInput.value.trim()
  const sid = Number(sidRaw)
  const name = nameInput.value.trim()
  if (!sidRaw || !Number.isInteger(sid) || sid < 1) {
    errorMsg.value = '请输入有效学号（正整数）'
    return
  }
  if (!name) {
    errorMsg.value = '请输入姓名'
    return
  }
  submitting.value = true
  try {
    const res = await studentLogin({ studentId: sid, name })
    auth.setStudent(res)
    studentIdInput.value = ''
    nameInput.value = ''
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
  <div class="student-route">
    <Home />

    <Teleport to="body">
      <Transition name="overlay">
        <div v-if="overlayVisible" class="overlay-mask" role="dialog" aria-modal="true">
          <div class="overlay-card">
            <h2 class="overlay-title">钟园幼儿园 2024 届大二班</h2>
            <p class="overlay-sub">欢迎回来，请输入你的学号与姓名</p>

            <form class="login-form" @submit.prevent="handleSubmit">
              <label class="field">
                <span class="label">学号</span>
                <input
                  v-model="studentIdInput"
                  class="input"
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  maxlength="3"
                  placeholder="例如 12"
                  :disabled="submitting"
                  autocomplete="off"
                />
              </label>
              <label class="field">
                <span class="label">姓名</span>
                <input
                  v-model="nameInput"
                  class="input"
                  type="text"
                  maxlength="10"
                  placeholder="请输入你的姓名"
                  :disabled="submitting"
                  autocomplete="off"
                />
              </label>

              <p v-if="errorMsg" class="error" role="alert">{{ errorMsg }}</p>

              <button type="submit" class="primary" :disabled="submitting">
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

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: 12px;
  color: var(--color-text-soft);
}

.input {
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s ease;
}

.input:focus {
  border-color: var(--color-primary);
}

.input:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
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
