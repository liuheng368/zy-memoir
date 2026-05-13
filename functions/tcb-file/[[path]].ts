/**
 * EdgeOne Pages Edge Function：CloudBase 临时文件 URL 只读代理
 *
 * CloudBase getTempFileURL 可能返回 `*.tcb.qcloud.la` 签名 URL。部分浏览器/扩展会对
 * 跨域图片读取触发 CORS 或 403，这里把图片读取改成同源 `/tcb-file/*`。
 */

const DEFAULT_FILE_HOST = '7a79-zy-memoir-d5gaxbvyxe80564f4-1306797866.tcb.qcloud.la'

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
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
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
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: corsHeaders(),
    })
  }

  const raw = params?.path
  const tail = Array.isArray(raw) ? raw.join('/') : (raw ?? '')
  const incomingUrl = new URL(request.url)
  const fileHost = env?.TCB_FILE_HOST || DEFAULT_FILE_HOST
  const targetUrl = `https://${fileHost}/${tail.replace(/^\/+/, '')}${incomingUrl.search}`

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
      redirect: 'manual',
    })
  } catch (err) {
    return new Response(
      JSON.stringify({
        code: 'EDGE_TCB_FILE_PROXY_FETCH_FAIL',
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
