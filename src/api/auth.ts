/**
 * src/api/auth.ts — 鉴权与名单 API
 *
 * 与云函数（cloudfunctions/{studentLogin,teacherLogin,adminCheck,listTeachers}）的契约：
 *   云函数统一返回 { ok, code, message, data? }；
 *   本层把 ok=false 的情况包装成 `AuthApiError` 抛出，调用方只处理成功路径。
 *
 * 与 plan v0.4 Q-PLAN-19（云函数主校验）/ Q-PLAN-18（HMAC token）对齐。
 */
import { callFunction } from './cloudbase'
import type { StudentProfile, TeacherProfile } from '@/stores/auth'

export type AuthErrorCode =
  | 'INVALID_INPUT'
  | 'STUDENT_NOT_FOUND'
  | 'NAME_MISMATCH'
  | 'TEACHER_NOT_FOUND'
  | 'INVALID_TOKEN'
  | 'EXPIRED_TOKEN'
  | 'SERVER_MISCONFIG'
  | 'LIST_ERROR'
  | 'UNKNOWN'

interface CloudFnResponse<T> {
  ok: boolean
  code: string
  message?: string
  data?: T
}

export class AuthApiError extends Error {
  code: AuthErrorCode
  raw: CloudFnResponse<unknown>
  constructor(raw: CloudFnResponse<unknown>) {
    super(raw.message || raw.code || 'auth api error')
    this.code = (raw.code as AuthErrorCode) || 'UNKNOWN'
    this.raw = raw
    this.name = 'AuthApiError'
  }
}

function unwrap<T>(res: CloudFnResponse<T>): T {
  if (!res || res.ok !== true) {
    throw new AuthApiError(res ?? { ok: false, code: 'UNKNOWN', message: 'empty response' })
  }
  if (res.data === undefined) {
    throw new AuthApiError({ ...res, message: 'response.data missing' })
  }
  return res.data
}

// ---------- 学生登录 ----------
export interface StudentLoginInput {
  studentId: number
  name: string
}
export interface StudentLoginResult {
  profile: StudentProfile
  token: string
}
export async function studentLogin(input: StudentLoginInput): Promise<StudentLoginResult> {
  const res = await callFunction<CloudFnResponse<StudentLoginResult>>('studentLogin', input)
  return unwrap(res)
}

// ---------- 老师登录 ----------
export interface TeacherLoginInput {
  teacherId: number
}
export interface TeacherLoginResult {
  profile: TeacherProfile
  token: string
}
export async function teacherLogin(input: TeacherLoginInput): Promise<TeacherLoginResult> {
  const res = await callFunction<CloudFnResponse<TeacherLoginResult>>('teacherLogin', input)
  return unwrap(res)
}

// ---------- 管理员校验 ----------
export interface AdminCheckResult {
  profile: { role: 'admin' }
  token: string
}
export async function adminCheck(token: string): Promise<AdminCheckResult> {
  const res = await callFunction<CloudFnResponse<AdminCheckResult>>('adminCheck', { token })
  return unwrap(res)
}

// ---------- 老师下拉名单 ----------
export interface TeacherListItem {
  id: number
  name: string
  role: 'lead' | 'assistant' | 'life'
}
export async function listTeachers(): Promise<TeacherListItem[]> {
  const res = await callFunction<CloudFnResponse<{ teachers: TeacherListItem[] }>>('listTeachers')
  return unwrap(res).teachers
}
