/**
 * 全局登录态 Store（Pinia）
 *
 * - 角色：student / teacher / admin / guest / null（未初始化）
 * - 持久化：
 *   - 登录态（student / teacher / admin）→ LocalStorage（spec Q11 = 永不过期）
 *   - 游客态（guest）→ sessionStorage（spec Q17 持久化方案 B = 本会话）
 * - G4 起 setStudent / setTeacher 直接接收云函数 `studentLogin / teacherLogin` 返回的 profile + token
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { SESSION_KEYS, STORAGE_KEYS } from '@/utils/constants'

export type Role = 'student' | 'teacher' | 'admin' | 'guest' | null

export interface StudentProfile {
  studentId: number
  name: string
  gender: 'male' | 'female' | 'unknown'
}

export interface TeacherProfile {
  teacherId: number
  name: string
  role: 'lead' | 'assistant' | 'life'
}

interface PersistedAuth {
  role: 'student' | 'teacher' | 'admin'
  studentProfile: StudentProfile | null
  teacherProfile: TeacherProfile | null
  token: string | null
  loadedAt: number
}

interface PersistedGuest {
  role: 'guest'
  loadedAt: number
}

interface InitialState {
  role: Role
  studentProfile: StudentProfile | null
  teacherProfile: TeacherProfile | null
  token: string | null
}

/** 从持久化层读取初始状态；优先 LocalStorage（登录态），其次 sessionStorage（游客态） */
function loadInitial(): InitialState {
  const empty: InitialState = {
    role: null,
    studentProfile: null,
    teacherProfile: null,
    token: null,
  }
  if (typeof window === 'undefined') return empty
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.AUTH)
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedAuth
      return {
        role: parsed.role,
        studentProfile: parsed.studentProfile,
        teacherProfile: parsed.teacherProfile,
        token: parsed.token,
      }
    }
    const guestRaw = window.sessionStorage.getItem(SESSION_KEYS.GUEST)
    if (guestRaw) {
      JSON.parse(guestRaw) as PersistedGuest
      return { ...empty, role: 'guest' }
    }
  } catch {
    // 忽略：损坏的持久化数据降级为未登录
  }
  return empty
}

export const useAuthStore = defineStore('auth', () => {
  const initial = loadInitial()

  const role = ref<Role>(initial.role)
  const studentProfile = ref<StudentProfile | null>(initial.studentProfile)
  const teacherProfile = ref<TeacherProfile | null>(initial.teacherProfile)
  const token = ref<string | null>(initial.token)
  /** 是否打开登录浮层（由 view 层根据 role + 当前路由决定） */
  const showLoginPanel = ref(false)

  // ---- getters ----
  const isLoggedIn = computed(
    () => role.value === 'student' || role.value === 'teacher' || role.value === 'admin',
  )
  const isGuest = computed(() => role.value === 'guest')
  const isUninitialized = computed(() => role.value === null)
  /** UI 是否走只读模式（游客 / 未初始化）；具体编辑能力还要叠加浮层 mode 判定 */
  const isReadOnly = computed(() => isGuest.value || isUninitialized.value)
  const displayName = computed(() => {
    if (role.value === 'student') return studentProfile.value?.name ?? ''
    if (role.value === 'teacher') return teacherProfile.value?.name ?? ''
    if (role.value === 'admin') return '管理员'
    if (role.value === 'guest') return '访客'
    return ''
  })
  /**
   * 是否拥有「主页合影管理」权限（v0.6 / PRD v0.4 / spec Q22 / plan Q-PLAN-22）
   *
   * - 老师 + 管理员：均允许进入 `/admin` 上传 / 删除合影；
   * - 学生 / 游客 / 未初始化：一律不可见；
   * - 同时限制必须持有有效 token（避免 role 残留无 token 状态被误放行）；
   * - 用于：`HomeTopbar` ⚙ 入口、`router/index.ts` `/admin` 守卫、`Admin.vue` 视图三处可见性收敛。
   */
  const canManageBanners = computed(
    () => (role.value === 'admin' || role.value === 'teacher') && !!token.value,
  )

  // ---- helpers ----
  function persistLogin() {
    if (typeof window === 'undefined') return
    if (role.value !== 'student' && role.value !== 'teacher' && role.value !== 'admin') return
    const payload: PersistedAuth = {
      role: role.value,
      studentProfile: studentProfile.value,
      teacherProfile: teacherProfile.value,
      token: token.value,
      loadedAt: Date.now(),
    }
    window.localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(payload))
    // 升级为正式角色后清空游客痕迹
    window.sessionStorage.removeItem(SESSION_KEYS.GUEST)
  }

  function persistGuest() {
    if (typeof window === 'undefined') return
    const payload: PersistedGuest = { role: 'guest', loadedAt: Date.now() }
    window.sessionStorage.setItem(SESSION_KEYS.GUEST, JSON.stringify(payload))
  }

  function clearPersistence() {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(STORAGE_KEYS.AUTH)
    window.sessionStorage.removeItem(SESSION_KEYS.GUEST)
  }

  // ---- actions ----
  /** G4a 学生登录成功后调用；profile / token 来自云函数 `studentLogin` */
  function setStudent(payload: { profile: StudentProfile; token: string }) {
    role.value = 'student'
    studentProfile.value = payload.profile
    teacherProfile.value = null
    token.value = payload.token
    showLoginPanel.value = false
    persistLogin()
  }

  /** G4b 老师登录成功后调用；profile / token 来自云函数 `teacherLogin` */
  function setTeacher(payload: { profile: TeacherProfile; token: string }) {
    role.value = 'teacher'
    teacherProfile.value = payload.profile
    studentProfile.value = null
    token.value = payload.token
    showLoginPanel.value = false
    persistLogin()
  }

  /** G3 admin route token 校验通过后调用 */
  function setAdmin(payload: { token: string }) {
    role.value = 'admin'
    studentProfile.value = null
    teacherProfile.value = null
    token.value = payload.token
    showLoginPanel.value = false
    persistLogin()
  }

  /** G4c 「↪ 跳过登录，仅浏览」入口（spec Q17 / plan Q-PLAN-15） */
  function skipToGuest() {
    role.value = 'guest'
    studentProfile.value = null
    teacherProfile.value = null
    token.value = null
    showLoginPanel.value = false
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEYS.AUTH)
    }
    persistGuest()
  }

  /** 顶栏「去登录」入口；不清空当前浏览态 */
  function openLoginPanel() {
    showLoginPanel.value = true
  }

  function closeLoginPanel() {
    showLoginPanel.value = false
  }

  /** 退出登录：清空一切，按当前路由由 view 决定弹回学生 / 老师浮层 */
  function logout() {
    role.value = null
    studentProfile.value = null
    teacherProfile.value = null
    token.value = null
    showLoginPanel.value = true
    clearPersistence()
  }

  return {
    // state
    role,
    studentProfile,
    teacherProfile,
    token,
    showLoginPanel,
    // getters
    isLoggedIn,
    isGuest,
    isUninitialized,
    isReadOnly,
    displayName,
    canManageBanners,
    // actions
    setStudent,
    setTeacher,
    setAdmin,
    skipToGuest,
    openLoginPanel,
    closeLoginPanel,
    logout,
  }
})
