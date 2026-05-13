/**
 * EdgeOne Pages Edge Function：COS 写请求反向代理
 *
 * CloudBase Web SDK 的 uploadFile 最终会让浏览器 PUT 到
 * `https://{bucket}.cos.ap-shanghai.myqcloud.com/...`。当前 COS 桶没有返回
 * CORS 预检头时，浏览器会在 OPTIONS 阶段直接拦截。
 *
 * 前端补丁会把 COS 写请求改成同源 `/cos/*`，这里再从 EdgeOne 服务端转发到
 * 真正的 COS bucket。这样浏览器不再跨域，COS 也不需要响应浏览器预检。
 */

const DEFAULT_BUCKET_HOST = '7a79-zy-memoir-d5gaxbvyxe80564f4-1306797866.cos.ap-shanghai.myqcloud.com'

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

export async function onRequest(context: OnRequestContext): Promise<Response> {
  const { request, env, params } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  const raw = params?.path
  const tail = Array.isArray(raw) ? raw.join('/') : (raw ?? '')
  const incomingUrl = new URL(request.url)
  const bucketHost = env?.COS_BUCKET_HOST || DEFAULT_BUCKET_HOST
  const targetUrl = `https://${bucketHost}/${tail.replace(/^\/+/, '')}${incomingUrl.search}`

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
        code: 'EDGE_COS_PROXY_FETCH_FAIL',
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
