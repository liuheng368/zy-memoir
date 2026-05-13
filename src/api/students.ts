/**
 * src/api/students.ts — 学生数据 API（主页头像墙 / 学生浮层 + G4 学生侧写入闭环）
 *
 * 与云函数契约：
 *   - listStudents (公开只读)            → 主页头像墙精简字段 + 派生 photoCount/recordingCount
 *   - getStudentDetail (公开只读)        → 学生浮层完整 schema (intro/avatar/photos/recordings)
 *   - updateStudentIntro (HMAC)          → 学生简介保存（≤ 300 字）
 *   - removeStudentAvatar (HMAC + COS 清理) → 删除本人头像
 *   - addStudentPhoto (HMAC)             → 学生新增照片（≤ 3 张）
 *   - removeStudentPhoto (HMAC + COS 清理) → 删除指定 photo
 *   - addStudentRecording (HMAC)         → 学生新增录音（≤ 5 段、单段 ≤ 60 s）
 *   - removeStudentRecording (HMAC + COS 清理) → 删除指定 recording
 *
 * 上传职责拆分：
 * - 文件上传 / 压缩 / 编码 全部走 src/composables/useUpload + useImageCompress + useMp3Encode；
 *   这里的 add* 接口只接 `{ fileID, url, ... }`，不直接吃 File。
 *
 * Plan 对应：API-7 / API-8 / API-9 / API-10 / API-11 / API-13 / API-14；M-④（学生头像墙）+ G6 浮层。
 */
import { callFunction } from './cloudbase'

interface CloudFnResponse<T> {
  ok: boolean
  code: string
  message?: string
  data?: T
}

export class StudentApiError extends Error {
  code: string
  raw: CloudFnResponse<unknown>
  constructor(raw: CloudFnResponse<unknown>) {
    super(raw.message || raw.code || 'students api error')
    this.code = raw.code || 'UNKNOWN'
    this.raw = raw
    this.name = 'StudentApiError'
  }
}

function unwrap<T>(res: CloudFnResponse<T>): T {
  if (!res || res.ok !== true) {
    throw new StudentApiError(res ?? { ok: false, code: 'UNKNOWN', message: 'empty response' })
  }
  if (res.data === undefined) {
    throw new StudentApiError({ ...res, message: 'response.data missing' })
  }
  return res.data
}

/** 头像（与学生详情 / 上传后写回的 schema 对齐；当前 seed 阶段为空） */
export interface AvatarRef {
  url: string
  /** 部分历史记录可能保留 fileID 以便后续删除 */
  fileID?: string
}

/** 照片条引用（schema 与云函数 addStudentPhoto 一致） */
export interface PhotoRef {
  id: string
  fileID: string
  url: string
  createdAt: number
}

/** 学生录音条引用（与 src/api/teachers.ts → RecordingRef 字段一致） */
export interface StudentRecordingRef {
  id: string
  fileID: string
  url: string
  /** 录音时长（秒），plan 约束 ≤ 60 s */
  duration: number
  createdAt: number
}

/** 主页头像墙的精简学生记录 */
export interface StudentSummary {
  id: number
  name: string
  gender: 'male' | 'female' | 'unknown'
  photoCount: number
  recordingCount: number
  avatar?: AvatarRef
}

/** 学生浮层完整记录（getStudentDetail 返回） */
export interface StudentDetail {
  id: number
  name: string
  gender: 'male' | 'female' | 'unknown'
  intro: string
  avatar: AvatarRef | null
  photos: PhotoRef[]
  recordings: StudentRecordingRef[]
  updatedAt: string | number | null
}

export async function listStudents(): Promise<StudentSummary[]> {
  const res = await callFunction<CloudFnResponse<{ students: StudentSummary[] }>>('listStudents')
  return unwrap(res).students
}

export async function getStudentDetail(studentId: number): Promise<StudentDetail> {
  const res = await callFunction<CloudFnResponse<{ student: StudentDetail }>>(
    'getStudentDetail',
    { studentId },
  )
  return unwrap(res).student
}

/* ------- 写入接口（均需透传 token；调用方从 useAuthStore().token 取） ------- */

export async function updateStudentIntro(input: {
  token: string
  intro: string
  /** admin 代写学生时使用；学生本人传自己的 id 也可（云函数会按 payload 兜底） */
  studentId?: number
}): Promise<{ intro: string }> {
  const res = await callFunction<CloudFnResponse<{ intro: string }>>('updateStudentIntro', input)
  return unwrap(res)
}

export async function updateStudentAvatar(input: {
  token: string
  fileID: string
  url?: string
  studentId?: number
}): Promise<{ avatar: AvatarRef }> {
  const res = await callFunction<CloudFnResponse<{ avatar: AvatarRef }>>(
    'updateStudentAvatar',
    input,
  )
  return unwrap(res)
}

export async function removeStudentAvatar(input: {
  token: string
  studentId?: number
}): Promise<{ avatar: null }> {
  const res = await callFunction<CloudFnResponse<{ avatar: null }>>(
    'removeStudentAvatar',
    input,
  )
  return unwrap(res)
}

export async function addStudentPhoto(input: {
  token: string
  fileID: string
  url?: string
  studentId?: number
}): Promise<{ photo: PhotoRef; photos: PhotoRef[] }> {
  const res = await callFunction<CloudFnResponse<{ photo: PhotoRef; photos: PhotoRef[] }>>(
    'addStudentPhoto',
    input,
  )
  return unwrap(res)
}

export async function removeStudentPhoto(input: {
  token: string
  photoId: string
  studentId?: number
}): Promise<{ photoId: string; photos: PhotoRef[] }> {
  const res = await callFunction<CloudFnResponse<{ photoId: string; photos: PhotoRef[] }>>(
    'removeStudentPhoto',
    input,
  )
  return unwrap(res)
}

export async function addStudentRecording(input: {
  token: string
  fileID: string
  url?: string
  duration: number
  studentId?: number
}): Promise<{ recording: StudentRecordingRef; recordings: StudentRecordingRef[] }> {
  const res = await callFunction<
    CloudFnResponse<{ recording: StudentRecordingRef; recordings: StudentRecordingRef[] }>
  >('addStudentRecording', input)
  return unwrap(res)
}

export async function removeStudentRecording(input: {
  token: string
  recordingId: string
  studentId?: number
}): Promise<{ recordingId: string; recordings: StudentRecordingRef[] }> {
  const res = await callFunction<
    CloudFnResponse<{ recordingId: string; recordings: StudentRecordingRef[] }>
  >('removeStudentRecording', input)
  return unwrap(res)
}
