/**
 * src/composables/useToast.ts — 全局 Toast 单例（G10 / 组 4 共用）
 *
 * - 模块级 reactive 队列，多组件共享；最多同时显示 3 条，超出 FIFO 推顶
 * - 类型：success / error / info / loading；loading 不自动消失，调用方拿 id 后手动 dismiss
 * - 默认 2.4 s 自动消失（ERROR 3.6 s）；用户 tap 可立即关
 * - 不依赖具体 UI；渲染在 src/components/common/Toast.vue
 */
import { reactive } from 'vue'

export type ToastType = 'success' | 'error' | 'info' | 'loading'

/** Toast 上的可点动作按钮（plan G11 弱网失败 Toast + 重试） */
export interface ToastAction {
  label: string
  /** 点击后回调；同步执行；调用方自行决定是否需要再 showToast 反馈 */
  handler: () => void
}

export interface ToastItem {
  id: number
  message: string
  type: ToastType
  /** 0 = 不自动消失（loading 默认 0；带 action 的 error 也建议设 0 让用户看清） */
  duration: number
  createdAt: number
  /** 可选：渲染一个内联按钮（如「重试」） */
  action?: ToastAction
}

const MAX_VISIBLE = 3
const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 2400,
  info: 2400,
  error: 3600,
  loading: 0,
}

const state = reactive({
  items: [] as ToastItem[],
})

let _seq = 1
const _timers = new Map<number, ReturnType<typeof setTimeout>>()

function trimExcess() {
  while (state.items.length > MAX_VISIBLE) {
    const dropped = state.items.shift()
    if (dropped) {
      const t = _timers.get(dropped.id)
      if (t) {
        clearTimeout(t)
        _timers.delete(dropped.id)
      }
    }
  }
}

function scheduleDismiss(id: number, duration: number) {
  if (duration <= 0) return
  const t = setTimeout(() => dismiss(id), duration)
  _timers.set(id, t)
}

export function showToast(
  message: string,
  type: ToastType = 'info',
  duration?: number,
  action?: ToastAction,
): number {
  const id = _seq++
  const item: ToastItem = {
    id,
    message,
    type,
    duration: duration ?? DEFAULT_DURATION[type],
    createdAt: Date.now(),
    action,
  }
  state.items.push(item)
  trimExcess()
  scheduleDismiss(id, item.duration)
  return id
}

export function dismiss(id: number): void {
  const idx = state.items.findIndex((it) => it.id === id)
  if (idx >= 0) state.items.splice(idx, 1)
  const t = _timers.get(id)
  if (t) {
    clearTimeout(t)
    _timers.delete(id)
  }
}

export function dismissAll(): void {
  for (const t of _timers.values()) clearTimeout(t)
  _timers.clear()
  state.items.splice(0, state.items.length)
}

/** 三个语义快捷方法 */
export const toast = {
  success: (msg: string, dur?: number) => showToast(msg, 'success', dur),
  error: (msg: string, dur?: number) => showToast(msg, 'error', dur),
  info: (msg: string, dur?: number) => showToast(msg, 'info', dur),
  loading: (msg: string) => showToast(msg, 'loading'),
  /**
   * 失败 + 重试组合 toast（plan G11）；duration=0 不自动消失，
   * 用户点重试 / 主动 dismiss 后才隐藏。
   */
  errorWithRetry: (msg: string, retry: () => void, dur = 0) =>
    showToast(msg, 'error', dur, { label: '重试', handler: retry }),
  dismiss,
  dismissAll,
}

export function useToast() {
  return {
    items: state.items,
    showToast,
    dismiss,
    dismissAll,
    toast,
  }
}
