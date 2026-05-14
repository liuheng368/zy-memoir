/**
 * 业务常量集中地（与 spec / plan 上限保持一致）
 *
 * 引用：
 * - PRD：图片 ≤ 3 MB、录音 ≤ 60s、学生照片 ≤ 3 张、学生录音 ≤ 5 段
 * - plan.md `### 技术选型 / 约束` & spec Q-INTRO-OVERFLOW
 */

/** 学生自我介绍最大字数（spec Q7） */
export const MAX_INTRO_LENGTH = 300

/** 学生照片墙上限（PRD 强制） */
export const MAX_STUDENT_PHOTOS = 3

/** 学生录音段数上限（PRD 强制） */
export const MAX_STUDENT_RECORDINGS = 5

/** 教师录音段数上限（plan Q-PLAN-12 默认采纳"不限"，前端不卡，仅占位） */
export const MAX_TEACHER_RECORDINGS = Infinity

/** 班级素材墙：每个登录身份最多上传 99 张图片 */
export const MAX_CLASS_MEDIA_PHOTOS = 99

/** 班级素材墙：每个登录身份最多上传 99 条语音 */
export const MAX_CLASS_MEDIA_RECORDINGS = 99

/** 单段录音最长时长（秒，PRD 强制 60s） */
export const MAX_RECORDING_SECONDS = 60

/** 单张图片压缩后体积上限（字节，PRD 强制 3 MB） */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024

/** 学生总数（与 data/2024_02_student_list.json `total` 对齐） */
export const TOTAL_STUDENTS = 36

/** 教师总数（与 data/2024_02_teacher_list.json `total` 对齐） */
export const TOTAL_TEACHERS = 3

/** localStorage 键名 */
export const STORAGE_KEYS = {
  /** 登录态（学生 / 老师 / 管理员），spec Q11 = 永不过期 */
  AUTH: 'zy-memoir:auth',
} as const

/** sessionStorage 键名 */
export const SESSION_KEYS = {
  /** 游客态（spec Q17 持久化 = 方案 B：本会话） */
  GUEST: 'zy-memoir:guest',
} as const

/** 路由路径常量 */
export const ROUTES = {
  HOME: '/',
  TEACHER: '/teacher',
  ADMIN: '/admin',
} as const

/** Banner 自动轮播间隔（ms，PRD v0.4 二期：5 秒） */
export const BANNER_AUTOPLAY_MS = 5000

/** 头像裁剪输出像素（正方形，PRD v0.4 二期 / spec Q-PLAN-2-1） */
export const AVATAR_CROP_OUTPUT_PX = 1024
