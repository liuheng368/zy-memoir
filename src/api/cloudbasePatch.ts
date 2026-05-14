/**
 * CloudBase API endpoint 同源化补丁
 *
 * 背景：
 *   - @cloudbase/js-sdk v2.x 不支持自定义 endpoint，核心 API 请求硬编码到
 *     `https://${envId}.${region}.tcb-api.tencentcloudapi.com`；
 *   - 匿名登录等 auth 请求会走 `https://${envId}.api.tcloudbasegateway.com/v1`
 *     或被 SDK 组装成同源 `/auth/v1/*` 相对路径；
 *   - CloudBase 免费版禁止加白第三方域名 → 浏览器 CORS 拦截；
 *   - EdgeOne Pages 上由 Edge Function（functions/tcb/[[path]].ts）
 *     反代到 CloudBase 网关并补 CORS 头。
 *
 * 本模块的工作：在 SDK 真正发起任何请求**之前**，把
 *   https://*.tcb-api.tencentcloudapi.com/<path>?<qs>
 * 重写为
 *   <当前页面 origin>/tcb/<path>?<qs>
 *
 * 同时把
 *   https://*.api.tcloudbasegateway.com/v1/<path>?<qs>
 *   /auth/v1/<path>?<qs>
 * 重写为
 *   <当前页面 origin>/tcb-gateway/<path>?<qs>
 *
 * 以及把浏览器直传 COS 的写请求
 *   PUT https://*.cos.<region>.myqcloud.com/<path>
 * 重写为
 *   PUT <当前页面 origin>/cos/<path>
 *
 * 同时为 LegacyXHR（CloudBase storage / 部分上传链路）做同样改写。
 *
 * 灰度开关：
 *   - 仅当 `import.meta.env.VITE_TCB_PROXY === 'edgeone'` 时启用
 *   - 默认（本地 dev / 回退场景）走原始 endpoint
 */

const TCB_API_HOST_FRAGMENT = 'tcb-api.tencentcloudapi.com'
const TCB_GATEWAY_HOST_FRAGMENT = 'api.tcloudbasegateway.com'
const COS_HOST_PATTERN = /\.cos\.[^.]+\.myqcloud\.com$/i
const TCB_API_PROXY_PREFIX = '/tcb'
const TCB_GATEWAY_PROXY_PREFIX = '/tcb-gateway'
const COS_PROXY_PREFIX = '/cos'
const FLAG_KEY = '__cloudbasePatchInstalled__'

function isAuthGatewayPath(pathname: string): boolean {
  return pathname.startsWith('/auth/v1/') || pathname.startsWith('/v1/auth/')
}

function shouldProxyCos(method?: string): boolean {
  const normalized = (method || 'GET').toUpperCase()
  return ['PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'].includes(normalized)
}

function appendEdgeOnePreviewParams(url: URL): void {
  const current = new URLSearchParams(window.location.search)
  current.forEach((value, key) => {
    if (key.startsWith('eo_') && !url.searchParams.has(key)) {
      url.searchParams.set(key, value)
    }
  })
}

/** 把 CloudBase 原始 URL 改写为同源代理路径 */
function rewriteUrl(input: string, method?: string): string {
  if (!input) return input
  try {
    const parsed = new URL(input, window.location.origin)
    const isRelativeOrSameOrigin =
      !/^[a-z][a-z\d+\-.]*:/i.test(input) ||
      parsed.origin === window.location.origin

    let newPath = ''
    if (parsed.host.includes(TCB_API_HOST_FRAGMENT) && isAuthGatewayPath(parsed.pathname)) {
      // auth/token 类接口必须走 CloudBase gateway；误走 tcb-api 会返回 401。
      newPath = `${TCB_GATEWAY_PROXY_PREFIX}${parsed.pathname}`
    } else if (parsed.host.includes(TCB_API_HOST_FRAGMENT)) {
      // 例：/auth.getJwt → /tcb/auth.getJwt
      newPath = `${TCB_API_PROXY_PREFIX}${parsed.pathname}`
    } else if (parsed.host.includes(TCB_GATEWAY_HOST_FRAGMENT)) {
      // 例：/v1/auth/v1/token → /tcb-gateway/v1/auth/v1/token
      newPath = `${TCB_GATEWAY_PROXY_PREFIX}${parsed.pathname}`
    } else if (COS_HOST_PATTERN.test(parsed.host) && shouldProxyCos(method)) {
      // 例：PUT /banners/x.jpg → PUT /cos/banners/x.jpg，规避浏览器到 COS 的 CORS 预检。
      newPath = `${COS_PROXY_PREFIX}${parsed.pathname}`
    } else if (
      isRelativeOrSameOrigin &&
      isAuthGatewayPath(parsed.pathname)
    ) {
      // SDK 的匿名登录可能被组成同源相对路径，避免落到 EdgeOne 页面路由。
      newPath = `${TCB_GATEWAY_PROXY_PREFIX}${parsed.pathname}`
    } else {
      return input
    }

    const newUrl = new URL(newPath + parsed.search + parsed.hash, window.location.origin)
    appendEdgeOnePreviewParams(newUrl)
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
      nextInput = rewriteUrl(input, init?.method)
    } else if (input instanceof URL) {
      nextInput = rewriteUrl(input.toString(), init?.method)
    } else if (typeof Request !== 'undefined' && input instanceof Request) {
      const rewritten = rewriteUrl(input.url, init?.method || input.method)
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
      const rewritten = rewriteUrl(original, method)
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
