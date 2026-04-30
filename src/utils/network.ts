/**
 * src/utils/network.ts — 简单的网络状态 / 错误归因（plan G11 弱网失败 Toast）
 *
 * 不引入第三方网络层；只做两件事：
 *   1. `isOffline()`：基于 `navigator.onLine` 给出粗判；移动端 4G 弱信号下也常常误报为
 *      `online=true`，因此**只能作为提示，不能作为是否发起请求的硬条件**。
 *   2. `networkErrorMessage(err, fallback?)`：把后端 / SDK 抛出的 Error.message 翻译成
 *      用户友好文案；显式离线时优先返回离线提示，避免一堆「fetch failed」吓人。
 *
 * 这两个 helper 主要被 Admin / 浮层上传 catch 块调用，配合
 * `toast.errorWithRetry(networkErrorMessage(err), retryFn)` 形成 plan G11 闭环。
 */
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

const NETWORK_ERR_RE = /(network|fetch|timeout|offline|disconnect|ECONN|aborted|ETIMEDOUT)/i

/** 是否「值得提供一键重试」：明确离线 / message 命中网络关键词 */
export function isNetworkError(err: unknown): boolean {
  if (isOffline()) return true
  const msg = (err as Error)?.message?.trim() || ''
  return !!msg && NETWORK_ERR_RE.test(msg)
}

export function networkErrorMessage(err: unknown, fallback = '操作失败，请重试'): string {
  if (isOffline()) return '网络已断开，请检查后重试'
  const msg = (err as Error)?.message?.trim() || ''
  if (!msg) return fallback
  if (NETWORK_ERR_RE.test(msg)) return '网络连接不稳定，请稍后重试'
  return msg
}
