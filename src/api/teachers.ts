/**
 * src/api/teachers.ts — 老师数据 API（主页老师风采区 + G4 老师侧写入闭环）
 *
 * 云函数契约：
 *   - listTeachers (公开只读)            → 主页老师风采区精简字段（id / name / role / avatar / recordings）
 *   - updateTeacherAvatar (HMAC)         → 老师换头像（仅本人或 admin）
 *   - addTeacherRecording (HMAC)         → 新增老师录音（PRD/Q-PLAN-12 不限段数；单段 ≤ 60 s）
 *   - removeTeacherRecording (HMAC + COS 清理) → 删除指定 recording
 *
 * 设计取舍：
 * - `src/api/auth.ts` 中也有 `listTeachers()` —— 那个是给 /teacher 登录浮层用的，类型保持
 *   精简（id / name / role）以便与登录契约稳定。这里给主页用，定义 fuller 字段（avatar /
 *   recordings），底层调同一个云函数（CloudBase 真服务返回的字段是超集）。
 * - 老师详情**不另起 cf**（直接复用 listTeachers 全量返回，再前端按 id 过滤）；G7 浮层若发现这条
 *   假设撑不住（数据量增长 / 字段裁剪需求）再补 `getTeacherDetail`。
 *
 * Plan 对应：API-6 / API-15 / API-16 / API-17 / API-18；M-③（老师风采）+ G7 浮层。
 */
import { callFunction } from './cloudbase'
import type { AvatarRef } from './students'

interface CloudFnResponse<T> {
  ok: boolean
  code: string
  message?: string
  data?: T
}

export class TeacherApiError extends Error {
  code: string
  raw: CloudFnResponse<unknown>
  constructor(raw: CloudFnResponse<unknown>) {
    super(raw.message || raw.code || 'teachers api error')
    this.code = raw.code || 'UNKNOWN'
    this.raw = raw
    this.name = 'TeacherApiError'
  }
}

function unwrap<T>(res: CloudFnResponse<T>): T {
  if (!res || res.ok !== true) {
    throw new TeacherApiError(res ?? { ok: false, code: 'UNKNOWN', message: 'empty response' })
  }
  if (res.data === undefined) {
    throw new TeacherApiError({ ...res, message: 'response.data missing' })
  }
  return res.data
}

/** 录音条引用（plan 数据契约：URL + 时长，秒；G4 起 cf 写入会带 id/fileID） */
export interface RecordingRef {
  /** 写入云函数生成的稳定 id（早期 seed 数据可能缺失） */
  id?: string
  url: string
  /** 录音时长（秒），plan §技术选型 / 约束 = ≤ 60 s */
  duration: number
  /** 录制时间（ISO 字符串或 ms 时间戳），可选 */
  createdAt?: string | number
  /** 历史记录可能保留 fileID 以便删除 */
  fileID?: string
}

export interface TeacherFull {
  id: number
  name: string
  role: 'lead' | 'assistant' | 'life'
  avatar?: AvatarRef
  /** 老师录音段（PRD: 不限段数；plan Q-PLAN-12） */
  recordings: RecordingRef[]
}

export async function listTeachers(): Promise<TeacherFull[]> {
  const res = await callFunction<CloudFnResponse<{ teachers: TeacherFull[] }>>('listTeachers')
  // 容错：seed 阶段 recordings 可能不存在或为 null
  return unwrap(res).teachers.map((t) => ({
    ...t,
    recordings: Array.isArray(t.recordings) ? t.recordings : [],
  }))
}

/** 老师浮层 G7 详情：复用 listTeachers + 按 id 客户端筛选；找不到时抛 TeacherApiError */
export async function getTeacherDetail(teacherId: number): Promise<TeacherFull> {
  const list = await listTeachers()
  const hit = list.find((t) => t.id === teacherId)
  if (!hit) {
    throw new TeacherApiError({ ok: false, code: 'NOT_FOUND', message: '老师不存在' })
  }
  return hit
}

/* ------- 写入接口（均需透传 token；调用方从 useAuthStore().token 取） ------- */

export async function updateTeacherAvatar(input: {
  token: string
  fileID: string
  url?: string
  /** admin 代写时使用；老师本人传自己的 id 也可（云函数会按 payload 兜底） */
  teacherId?: number
}): Promise<{ avatar: AvatarRef }> {
  const res = await callFunction<CloudFnResponse<{ avatar: AvatarRef }>>(
    'updateTeacherAvatar',
    input,
  )
  return unwrap(res)
}

export async function addTeacherRecording(input: {
  token: string
  fileID: string
  url?: string
  duration: number
  teacherId?: number
}): Promise<{ recording: RecordingRef; recordings: RecordingRef[] }> {
  const res = await callFunction<
    CloudFnResponse<{ recording: RecordingRef; recordings: RecordingRef[] }>
  >('addTeacherRecording', input)
  return unwrap(res)
}

export async function removeTeacherRecording(input: {
  token: string
  recordingId: string
  teacherId?: number
}): Promise<{ recordingId: string; recordings: RecordingRef[] }> {
  const res = await callFunction<
    CloudFnResponse<{ recordingId: string; recordings: RecordingRef[] }>
  >('removeTeacherRecording', input)
  return unwrap(res)
}
