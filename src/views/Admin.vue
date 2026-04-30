<script setup lang="ts">
/**
 * 路由 `/admin?token=...` 管理员页（plan G9 / Q-PLAN-18）
 *
 * G2 阶段实质化：
 * - 路由守卫（src/router/index.ts）已拦掉 guest / 缺 token；
 * - 本视图 onMounted 调云函数 `adminCheck` 验 HMAC token；
 * - 通过 → setAdmin；失败 → 显示错误并提供「返回主页」入口；
 * - G9 起再补主页合影上传 / 删除 UI。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { adminCheck, AuthApiError } from '@/api/auth'
import { ROUTES } from '@/utils/constants'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const checking = ref(false)
const checkError = ref('')

const tokenInQuery = computed(() => {
  const t = route.query.token
  return typeof t === 'string' ? t.trim() : ''
})

async function verifyAdmin(token: string) {
  checking.value = true
  checkError.value = ''
  try {
    const res = await adminCheck(token)
    auth.setAdmin({ token: res.token })
  } catch (e) {
    if (e instanceof AuthApiError) {
      checkError.value =
        e.code === 'EXPIRED_TOKEN'
          ? '管理员 token 已过期，请联系负责人重新签发'
          : '管理员 token 校验失败'
    } else {
      checkError.value = (e as Error)?.message || '校验异常，请稍后重试'
    }
  } finally {
    checking.value = false
  }
}

onMounted(() => {
  // 已是 admin → 不再重复校验
  if (auth.role === 'admin' && auth.token) return
  if (tokenInQuery.value) {
    void verifyAdmin(tokenInQuery.value)
  }
})

function backHome() {
  router.push(ROUTES.HOME)
}
</script>

<template>
  <main class="admin">
    <header class="topbar">
      <button class="back" @click="backHome">← 返回主页</button>
      <h1>管理员</h1>
    </header>

    <section v-if="checking" class="placeholder">
      <p>正在校验管理员 token…</p>
    </section>

    <section v-else-if="checkError" class="placeholder error-box">
      <h2>校验失败</h2>
      <p>{{ checkError }}</p>
      <button class="primary" @click="backHome">返回主页</button>
    </section>

    <section v-else-if="auth.role === 'admin'" class="placeholder">
      <h2>主页合影管理</h2>
      <p>G9 实现：合影网格（上传 / 删除 + 二次确认）。当前角色：{{ auth.role }}</p>
    </section>

    <section v-else class="placeholder">
      <p>等待校验…</p>
    </section>
  </main>
</template>

<style scoped>
.admin {
  min-height: 100vh;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: var(--color-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.topbar h1 {
  margin: 0;
  font-size: 16px;
}

.back {
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 13px;
  padding: 4px 8px;
  cursor: pointer;
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
  margin: 0 0 8px;
  font-size: 13px;
}

.error-box {
  border-color: #ffccc7;
  color: #d4380d;
}

.primary {
  margin-top: 8px;
  padding: 8px 20px;
  border: none;
  border-radius: 999px;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
</style>
