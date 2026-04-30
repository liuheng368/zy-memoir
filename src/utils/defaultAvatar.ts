/**
 * src/utils/defaultAvatar.ts — 默认头像（plan G11 / spec Q8 默认占位）
 *
 * 当学生 / 老师未上传头像时，使用与性别 / 角色匹配的内置 SVG 占位，
 * 比纯首字符色块更亲和，符合「毕业纪念册」氛围。
 *
 * Vite 默认会把 `*.svg` import 处理为 URL，可直接给 <img :src=""> 使用。
 */
import maleUrl from '@/assets/avatars/default-male.svg'
import femaleUrl from '@/assets/avatars/default-female.svg'
import unknownUrl from '@/assets/avatars/default-unknown.svg'
import teacherUrl from '@/assets/avatars/default-teacher.svg'

export type Gender = 'male' | 'female' | 'unknown'

/**
 * 学生默认头像；按性别返回粉 / 蓝 / 灰三色卡通占位。
 *
 * 使用：`<img :src="student.avatar?.url || defaultStudentAvatar(student.gender)">`
 */
export function defaultStudentAvatar(gender: Gender | undefined | null): string {
  if (gender === 'male') return maleUrl
  if (gender === 'female') return femaleUrl
  return unknownUrl
}

/** 老师默认头像（与学生区分：暖咖色调 + 眼镜，更"成年" / 教师感） */
export function defaultTeacherAvatar(): string {
  return teacherUrl
}
