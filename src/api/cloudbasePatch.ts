/**
 * CloudBase API endpoint 同源化补丁
 *
 * 背景：
 *   - @cloudbase/js-sdk v2.x 不支持自定义 endpoint，所有请求硬编码到
 *     `https://${envId}.${region}.tcb-api.tencentcloudapi.com`；
 *   - CloudBase 免费版禁止加白第三方域名 → 浏览器 CORS 拦截；
 *   - EdgeOne Pages 上由 Edge Function（functions/tcb/[[path]].ts）
 *     反代到 CloudBase 网关并补 CORS 头。
 *
 * 本模块的工作：在 SDK 真正发起任何请求**之前**，把
 *   https://*.tcb-api.tencentcloudapi.com/<path>?<qs>
 * 重写为
 *   <当前页面 origin>/tcb/<path>?<qs>
 *
 * 同时为 LegacyXHR（CloudBase storage / 部分上传链路）做同样改写。
 *
 * 灰度开关：
 *   - 仅当 `import.meta.env.VITE_TCB_PROXY === 'edgeone'` 时启用
 *   - 默认（本地 dev / 回退场景）走原始 endpoint
 */

const TARGET_HOST_FRAGMENT = 'tcb-api.tencentcloudapi.com'
const PROXY_PREFIX = '/tcb'
const FLAG_KEY = '__cloudbasePatchInstalled__'

/** 把 CloudBase 原始 URL 改写为同源 /tcb 路径 */
function rewriteUrl(input: string): string {
  if (!input || !input.includes(TARGET_HOST_FRAGMENT)) return input
  try {
    const parsed = new URL(input)
    if (!parsed.host.includes(TARGET_HOST_FRAGMENT)) return input
    // 例：/auth.getJwt → /tcb/auth.getJwt
    const newPath = `${PROXY_PREFIX}${parsed.pathname}`
    const newUrl = new URL(newPath + parsed.search + parsed.hash, window.location.origin)
    return newUrl.toString()
  } catch {
    // 非合法 URL（可能是相对路径），不动
    return input
  }
}

/**
 * 安装 fetch / XMLHttpRequest 拦截器
 *
 * 幂等：HMR / SSR 重复 import 不会装两次（用 window 标记位）。
 */
export function installCloudBaseProxyPatch(): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as Record<string, unknown>
  if (w[FLAG_KEY]) return
  w[FLAG_KEY] = true

  // ---------- 1) patch fetch ----------
  const originalFetch = window.fetch.bind(window)
  window.fetch = function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    let nextInput: RequestInfo | URL = input
    if (typeof input === 'string') {
      nextInput = rewriteUrl(input)
    } else if (input instanceof URL) {
      nextInput = rewriteUrl(input.toString())
    } else if (typeof Request !== 'undefined' && input instanceof Request) {
      const rewritten = rewriteUrl(input.url)
      if (rewritten !== input.url) {
        nextInput = new Request(rewritten, input)
      }
    }
    return originalFetch(nextInput, init)
  } as typeof window.fetch

  // ---------- 2) patch XMLHttpRequest ----------
  if (typeof XMLHttpRequest !== 'undefined') {
    const originalOpen = XMLHttpRequest.prototype.open
    // open 签名：(method, url, async?, user?, password?)
    // 用 unknown[] 兜住可选参数，避免 TS 重载冲突
    XMLHttpRequest.prototype.open = function patchedOpen(
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ): void {
      const original = typeof url === 'string' ? url : url.toString()
      const rewritten = rewriteUrl(original)
      // @ts-expect-error 透传剩余可变参数到原生 open
      return originalOpen.call(this, method, rewritten, ...rest)
    } as typeof XMLHttpRequest.prototype.open
  }
}

/** 仅供测试 / 调试使用：返回当前是否已 patch */
export function isCloudBaseProxyPatched(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean((window as unknown as Record<string, unknown>)[FLAG_KEY])
}
