/**
 * EdgeOne Pages Edge Function：CloudBase gateway/auth 反向代理
 *
 * 触发路径：所有 /tcb-gateway/* 请求都进这个 Function。
 *
 * CloudBase Web SDK 的匿名登录、token 刷新等请求会走
 * `https://{envId}.api.tcloudbasegateway.com/v1/...`。EdgeOne Pages 场景下
 * 前端先把这些请求改成同源 `/tcb-gateway/*`，再由这里转回 CloudBase gateway，
 * 避免浏览器跨域或 EdgeOne 页面路由返回 401。
 */

const DEFAULT_ENV_ID = 'zy-memoir-d5gaxbvyxe80564f4'

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
  'content-encoding',
  'content-length',
])

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

function normalizeGatewayPath(tail: string): string {
  const cleanTail = tail.replace(/^\/+/, '')
  if (!cleanTail) return '/v1'
  if (cleanTail.startsWith('auth/v1/')) return `/${cleanTail}`
  return cleanTail.startsWith('v1/') ? `/${cleanTail}` : `/v1/${cleanTail}`
}

export async function onRequest(context: OnRequestContext): Promise<Response> {
  const { request, env, params } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const raw = params?.path
  const tail = Array.isArray(raw) ? raw.join('/') : (raw ?? '')
  const incomingUrl = new URL(request.url)
  const envId = env?.TCB_ENV_ID || DEFAULT_ENV_ID
  const targetUrl = `https://${envId}.api.tcloudbasegateway.com${normalizeGatewayPath(tail)}${incomingUrl.search}`

  const forwardHeaders = new Headers()
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_REQUEST_HEADERS.has(key.toLowerCase())) {
      forwardHeaders.set(key, value)
    }
  })

  let upstream: Response
  try {
    upstream = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body:
        request.method === 'GET' || request.method === 'HEAD'
          ? undefined
          : request.body,
      redirect: 'manual',
    })
  } catch (err) {
    return new Response(
      JSON.stringify({
        code: 'EDGE_GATEWAY_PROXY_FETCH_FAIL',
        message: (err as Error)?.message || 'fetch upstream failed',
        target: targetUrl,
      }),
      {
        status: 502,
        headers: { 'content-type': 'application/json', ...corsHeaders() },
      },
    )
  }

  const responseHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value)
    }
  })
  Object.entries(corsHeaders()).forEach(([key, value]) => {
    responseHeaders.set(key, value)
  })

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}
