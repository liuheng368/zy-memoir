/**
 * src/api/banners.ts — 主页合影轮播 API（plan API-5 / API-19 / API-20）
 *
 * G5 起切真接口（云函数 listBanners / addBanner / removeBanner，HMAC 走 ADMIN_HMAC_KEY）。
 *
 * 与云函数契约：
 *   - listBanners (公开只读)            → 主页 / Admin 共用，按 createdAt desc，URL 现场刷新
 *   - addBanner (admin HMAC)            → 管理员上传新合影
 *   - removeBanner (admin HMAC + COS)   → 管理员删除（同步清理 COS 文件）
 *
 * 上传职责拆分：业务方先 useImageCompress + useUpload 拿到 fileID + url，
 * 这里 addBanner 只接 `{ fileID, url, caption? }`，不直接吃 File。
 */
import { callFunction } from './cloudbase'

interface CloudFnResponse<T> {
  ok: boolean
  code: string
  message?: string
  data?: T
}

export class BannerApiError extends Error {
  code: string
  raw: CloudFnResponse<unknown>
  constructor(raw: CloudFnResponse<unknown>) {
    super(raw.message || raw.code || 'banners api error')
    this.code = raw.code || 'UNKNOWN'
    this.raw = raw
    this.name = 'BannerApiError'
  }
}

function unwrap<T>(res: CloudFnResponse<T>): T {
  if (!res || res.ok !== true) {
    throw new BannerApiError(res ?? { ok: false, code: 'UNKNOWN', message: 'empty response' })
  }
  if (res.data === undefined) {
    throw new BannerApiError({ ...res, message: 'response.data missing' })
  }
  return res.data
}

/** 合影记录（与 cloudfunctions/listBanners 返回 schema 一致） */
export interface Banner {
  id: string
  fileID: string
  url: string
  caption?: string
  createdAt?: number
  /** 默认 'admin'（仅管理员可写入） */
  uploadedBy?: string
}

export async function listBanners(): Promise<Banner[]> {
  const res = await callFunction<CloudFnResponse<{ banners: Banner[] }>>('listBanners')
  return unwrap(res).banners
}

/* ------- 写入接口（均需透传 admin token；调用方从 useAuthStore().token 取） ------- */

export interface AddBannerInput {
  token: string
  fileID: string
  url?: string
  caption?: string
}

export async function addBanner(input: AddBannerInput): Promise<{ banner: Banner }> {
  const res = await callFunction<CloudFnResponse<{ banner: Banner }>>('addBanner', input)
  return unwrap(res)
}

export interface RemoveBannerInput {
  token: string
  bannerId: string
}

export async function removeBanner(input: RemoveBannerInput): Promise<{ bannerId: string }> {
  const res = await callFunction<CloudFnResponse<{ bannerId: string }>>('removeBanner', input)
  return unwrap(res)
}
