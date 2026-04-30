/**
 * src/api/students.ts — 学生数据 API（主页学生头像墙 / 学生详情聚合）
 *
 * 与云函数 `cloudfunctions/listStudents` 的契约：
 *   出参：{ ok, code: 'LIST_OK', data: { students: StudentSummary[] } }
 *
 * 设计取舍：
 * - 主页仅需精简字段 + 派生计数（photoCount / recordingCount），
 *   云函数侧已从 photos.length / recordings.length 派生（schema 升级后无须改前端）。
 * - 学生详情（含 photos / recordings 大字段）走另一个云函数（G7 实现），不在本文件暴露。
 *
 * Plan 对应：API-7、M-④（学生头像墙）。
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

/** 主页头像墙的精简学生记录 */
export interface StudentSummary {
  id: number
  name: string
  gender: 'male' | 'female' | 'unknown'
  photoCount: number
  recordingCount: number
  avatar?: AvatarRef
}

export async function listStudents(): Promise<StudentSummary[]> {
  const res = await callFunction<CloudFnResponse<{ students: StudentSummary[] }>>('listStudents')
  return unwrap(res).students
}
