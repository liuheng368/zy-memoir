/**
 * src/composables/useUpload.ts — 通用 CloudBase 上传封装（progress / retry / 乐观 UI）
 *
 * 设计：
 * - 调 `getApp().uploadFile({ cloudPath, filePath: file, onUploadProgress })`
 *   返回 `{ fileID, requestId }`；CloudBase SDK 自带临时 URL，可用 `getTempFileURL`
 *   解析为 https URL 供 `<img>/<audio>` 使用；
 * - retry：失败后再试 `retries` 次，指数退避（默认 1 次重试）；
 * - 乐观 UI：业务方拿到 `progress / status` ref 直接绑视图。
 *
 * Plan: G8 useUpload；AC: AC-14 错误回退 + 乐观 UI。
 */
import { ref } from 'vue'
import { ensureAnonAuth, getApp } from '@/api/cloudbase'

export type UploadKind = 'avatar' | 'photo' | 'recording' | 'banner'
export type UploadStatus = 'idle' | 'uploading' | 'success' | 'failed'

export interface UploadParams {
  /** COS 路径，如 `students/12/photo/<uuid>.jpg`（须不以 `/` 开头） */
  cloudPath: string
  /** 浏览器 File/Blob */
  file: File | Blob
  /** 类目，仅用于 task 分类与日志 */
  kind?: UploadKind
  /** 失败重试次数（不含首次），默认 1 */
  retries?: number
  /** 单次重试间隔（ms），默认 800 ms（指数退避基数） */
  backoffMs?: number
}

export interface UploadResult {
  fileID: string
  /** CloudBase 解析后的 https URL（可直接给 <img>/<audio>） */
  url: string
  /** 兼容旧 API 的 requestId（如有） */
  requestId?: string
}

/** CloudBase SDK uploadFile 的最小契约（仅用于本文件类型推断） */
interface CloudUploadResp {
  fileID: string
  requestId?: string
}

interface CloudFileMeta {
  fileID: string
  tempFileURL?: string
  url?: string
  code?: string
  errMsg?: string
}

interface CloudGetTempUrlResp {
  fileList: CloudFileMeta[]
}

/** 将 fileID 解析为可直接渲染的 https URL；失败时回落到 fileID（前端可继续展示占位） */
async function resolveUrl(fileID: string): Promise<string> {
  try {
    const app = getApp()
    // SDK 提供 getTempFileURL；签发短期 URL（默认 2 小时）
    const r = (await app.getTempFileURL({
      fileList: [fileID],
    })) as unknown as CloudGetTempUrlResp
    const item = r.fileList?.[0]
    return item?.tempFileURL || item?.url || fileID
  } catch {
    return fileID
  }
}

export function useUpload() {
  const status = ref<UploadStatus>('idle')
  const progress = ref(0)
  const kind = ref<UploadKind | null>(null)
  const error = ref<string | null>(null)
  const lastFileID = ref<string | null>(null)
  const lastUrl = ref<string | null>(null)

  function reset(): void {
    status.value = 'idle'
    progress.value = 0
    kind.value = null
    error.value = null
    lastFileID.value = null
    lastUrl.value = null
  }

  async function uploadOnce(params: UploadParams): Promise<UploadResult> {
    // 默认 CloudBase v2 SDK 直传 COS 需要用户态；生产临时免鉴权时 ensureAnonAuth 会直接返回。
    await ensureAnonAuth()
    const app = getApp()
    progress.value = 0
    const resp = (await app.uploadFile({
      cloudPath: params.cloudPath,
      filePath: params.file as unknown as string, // SDK 浏览器端接受 File/Blob，类型签名不够准
      onUploadProgress: (e: { loaded: number; total: number }) => {
        if (!e || !e.total) return
        progress.value = Math.min(99, Math.round((e.loaded / e.total) * 100))
      },
    })) as unknown as CloudUploadResp
    if (!resp || !resp.fileID) {
      throw new Error('upload returned empty fileID')
    }
    const url = await resolveUrl(resp.fileID)
    progress.value = 100
    return { fileID: resp.fileID, url, requestId: resp.requestId }
  }

  async function upload(params: UploadParams): Promise<UploadResult> {
    if (!params.cloudPath || params.cloudPath.startsWith('/')) {
      throw new Error('cloudPath must be a relative path, e.g. "students/12/photo/x.jpg"')
    }
    error.value = null
    kind.value = params.kind ?? null
    status.value = 'uploading'
    const retries = Math.max(0, params.retries ?? 1)
    const backoffMs = Math.max(0, params.backoffMs ?? 800)
    let lastErr: unknown = null
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const result = await uploadOnce(params)
        status.value = 'success'
        lastFileID.value = result.fileID
        lastUrl.value = result.url
        return result
      } catch (e) {
        lastErr = e
        // 不是最后一次重试 → 等待后再来
        if (attempt < retries) {
          progress.value = 0
          await sleep(backoffMs * Math.pow(2, attempt))
          continue
        }
      }
    }
    status.value = 'failed'
    const msg = (lastErr as Error)?.message ?? 'upload failed'
    error.value = msg
    throw new Error(msg)
  }

  return {
    status,
    progress,
    kind,
    error,
    lastFileID,
    lastUrl,
    upload,
    reset,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** 简易 uuid（不引入第三方；rfc4122 v4 风格的近似实现，供 cloudPath 拼装使用） */
export function uuidShort(): string {
  // crypto.randomUUID 在所有目标浏览器（Safari 15.4+/Chrome 92+/Edge 92+）均可用
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  }
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36)
}
