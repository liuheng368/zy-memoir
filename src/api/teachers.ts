/**
 * src/api/teachers.ts — 老师数据 API（主页老师风采区）
 *
 * 与云函数 `cloudfunctions/listTeachers` 的契约（G3 起返回 fuller schema）：
 *   出参：{ ok, code: 'LIST_OK', data: { teachers: TeacherFull[] } }
 *
 * 设计取舍：
 * - `src/api/auth.ts` 中也有 `listTeachers()` —— 那个是给 /teacher 登录浮层用的，类型保持
 *   精简（id / name / role）以便与登录契约稳定。这里给主页用，定义 fuller 字段（avatar /
 *   recordings），底层调同一个云函数（CloudBase 真服务返回的字段是超集）。
 *
 * Plan 对应：API-6、M-③（老师风采）。
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

/** 录音条引用（plan 数据契约：URL + 时长，秒） */
export interface RecordingRef {
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
