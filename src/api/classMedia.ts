import { callFunction } from './cloudbase'

interface CloudFnResponse<T> {
  ok: boolean
  code: string
  message?: string
  data?: T
}

export class ClassMediaApiError extends Error {
  code: string
  raw: CloudFnResponse<unknown>
  constructor(raw: CloudFnResponse<unknown>) {
    super(raw.message || raw.code || 'class media api error')
    this.code = raw.code || 'UNKNOWN'
    this.raw = raw
    this.name = 'ClassMediaApiError'
  }
}

function unwrap<T>(res: CloudFnResponse<T>): T {
  if (!res || res.ok !== true) {
    throw new ClassMediaApiError(res ?? { ok: false, code: 'UNKNOWN', message: 'empty response' })
  }
  if (res.data === undefined) {
    throw new ClassMediaApiError({ ...res, message: 'response.data missing' })
  }
  return res.data
}

export type ClassMediaType = 'photo' | 'recording'
export type ClassMediaOwnerRole = 'student' | 'teacher' | 'admin'

export interface ClassMediaItem {
  id: string
  type: ClassMediaType
  fileID: string
  url: string
  duration?: number
  ownerRole: ClassMediaOwnerRole
  ownerKey: string
  ownerName: string
  createdAt: number
}

export interface AddClassMediaInput {
  token: string
  type: ClassMediaType
  fileID: string
  url?: string
  duration?: number
}

export async function listClassMedia(): Promise<ClassMediaItem[]> {
  const res = await callFunction<CloudFnResponse<{ items: ClassMediaItem[] }>>('listClassMedia')
  return unwrap(res).items
}

export async function addClassMedia(input: AddClassMediaInput): Promise<{
  item: ClassMediaItem
  counts: { photos: number; recordings: number }
}> {
  const res = await callFunction<
    CloudFnResponse<{ item: ClassMediaItem; counts: { photos: number; recordings: number } }>
  >('addClassMedia', input)
  return unwrap(res)
}
