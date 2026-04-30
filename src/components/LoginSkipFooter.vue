<script setup lang="ts">
/**
 * LoginSkipFooter — 登录浮层底部「↪ 跳过登录，仅浏览」入口
 *
 * spec Q17 / plan Q-PLAN-15 / Q-PLAN-17：
 * - 仅承载「跳过登录 → 游客态」逻辑；不包含「我是老师 / 我是学生」反向跳转链接
 * - 视觉上是文本按钮 + 左侧返回箭头 icon，与「进入」主按钮拉开层级
 */
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

function handleSkip() {
  auth.skipToGuest()
  // 跳过后由父级 view 控制关闭浮层、跳转主页
}
</script>

<template>
  <div class="login-skip-footer">
    <button type="button" class="skip-btn" @click="handleSkip">
      <span class="arrow" aria-hidden="true">↪</span>
      <span>跳过登录，仅浏览</span>
    </button>
    <p class="hint">游客模式下可浏览全部内容，但无法编辑或上传</p>
  </div>
</template>

<style scoped>
.login-skip-footer {
  text-align: center;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px dashed var(--c-border, #e5e7eb);
}
.skip-btn {
  background: none;
  border: 0;
  color: var(--c-text-secondary, #6b7280);
  font-size: 0.9rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  transition: background 0.15s ease;
}
.skip-btn:hover {
  background: var(--c-surface-hover, #f3f4f6);
  color: var(--c-text, #111827);
}
.arrow {
  font-size: 1rem;
}
.hint {
  font-size: 0.75rem;
  color: var(--c-text-tertiary, #9ca3af);
  margin: 0.4rem 0 0;
}
</style>
