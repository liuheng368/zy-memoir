/**
 * EdgeOne Pages Edge Function：CloudBase API 反向代理
 *
 * 触发路径：所有 /tcb/* 请求都进这个 Function
 *
 * 背景：
 *   - CloudBase 免费版禁止通过 envDomainManagement.create 添加自定义 Web 安全域名
 *     （CreateAuthDomain → 「当前套餐无法执行此操作」）
 *   - 因此 EdgeOne Pages 默认域 `*.edgeone.cool` 直接调用
 *     `*.tcb-api.tencentcloudapi.com` 会被浏览器 CORS 拦截
 *   - 解决：把云函数请求改走同源 `/tcb/*`，由 Edge Function 透传到 CloudBase API，
 *     在响应里补上 `Access-Control-Allow-Origin: *`
 *
 * 路径映射（catchall）：
 *   /tcb/auth.getJwt          → https://{envId}.{region}.tcb-api.tencentcloudapi.com/auth.getJwt
 *   /tcb/functions.invokeFunction
 *   /tcb/storage.uploadMetadata
 *   ...
 *
 * 配置约定：
 *   - envId 通过 EdgeOne Pages 控制台「环境变量」配置 TCB_ENV_ID（运行时 env.TCB_ENV_ID）
 *   - 缺省回退到硬编码常量 DEFAULT_ENV_ID（避免环境变量漏配时直接 502）
 *   - region 默认 ap-shanghai（项目本身就在上海可用区）
 */

const DEFAULT_ENV_ID = 'zy-memoir-d5gaxbvyxe80564f4'
const DEFAULT_REGION = 'ap-shanghai'

/** 不应该往后端转发的浏览器/边缘网络专属头 */
const HOP_BY_HOP_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  // EdgeOne / CDN 专属头，避免污染目标 CloudBase 网关
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-forwarded-host',
  'x-real-ip',
  'cf-connecting-ip',
  'cf-ray',
  'cf-visitor',
  'eo-connecting-ip',
  'eo-client-ip',
])

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authenticate',
  'trailer',
  // 让浏览器拿到原始 Content-Encoding 没意义（边缘函数已解码）
  'content-encoding',
  // 让 EdgeOne 自己重算长度
  'content-length',
])

/** 统一加在所有响应上的 CORS 头（含 OPTIONS 预检） */
function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': '*',
    'Access-Control-Max-Age': '86400',
  }
}

interface OnRequestContext {
  request: Request
  env?: Record<string, string | undefined>
  params: Record<string, string | string[] | undefined>
}

function isAuthGatewayPath(tail: string): boolean {
  const cleanTail = tail.replace(/^\/+/, '')
  return cleanTail.startsWith('auth/v1/') || cleanTail.startsWith('v1/auth/')
}

function normalizeGatewayPath(tail: string): string {
  const cleanTail = tail.replace(/^\/+/, '')
  if (!cleanTail) return '/v1'
  return cleanTail.startsWith('v1/') ? `/${cleanTail}` : `/v1/${cleanTail}`
}

/**
 * EdgeOne Pages Functions 标准入口
 * 文档：https://edgeone.ai/document/162935826921332736
 */
export async function onRequest(context: OnRequestContext): Promise<Response> {
  const { request, env, params } = context

  // OPTIONS 预检直接放行
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  // 解析目标路径：catchall 参数名 = 文件名 [[path]] 中的 path
  const raw = params?.path
  const tail = Array.isArray(raw) ? raw.join('/') : (raw ?? '')
  const incomingUrl = new URL(request.url)

  const envId = env?.TCB_ENV_ID || DEFAULT_ENV_ID
  const region = env?.TCB_REGION || DEFAULT_REGION
  const targetUrl = isAuthGatewayPath(tail)
    ? `https://${envId}.api.tcloudbasegateway.com${normalizeGatewayPath(tail)}${incomingUrl.search}`
    : `https://${envId}.${region}.tcb-api.tencentcloudapi.com/${tail}${incomingUrl.search}`

  // 复制请求头，剔除 hop-by-hop / 边缘代理污染头
  const forwardHeaders = new Headers()
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_REQUEST_HEADERS.has(key.toLowerCase())) {
      forwardHeaders.set(key, value)
    }
  })

  // 透传请求到 CloudBase 网关
  let upstream: Response
  try {
    upstream = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body:
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : request.body,
      // EdgeOne 默认会跟随 redirect，这里显式 manual 防止 SDK 拿不到 302
      redirect: 'manual',
    })
  } catch (err) {
    return new Response(
      JSON.stringify({
        code: 'EDGE_PROXY_FETCH_FAIL',
        message: (err as Error)?.message || 'fetch upstream failed',
        target: targetUrl,
      }),
      {
        status: 502,
        headers: { 'content-type': 'application/json', ...corsHeaders() },
      },
    )
  }

  // 复制响应头，剔除 hop-by-hop，覆盖 CORS
  const responseHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value)
    }
  })
  Object.entries(corsHeaders()).forEach(([k, v]) => {
    responseHeaders.set(k, v)
  })

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}
