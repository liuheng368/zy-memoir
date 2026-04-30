/**
 * 班级数据 Store（Pinia）
 *
 * 主页（Home.vue）三大数据源的统一缓存层：
 *   - students：listStudents() → 36 名学生精简记录
 *   - teachers：listTeachers() → 3 名老师 + recordings
 *   - banners ：listBanners()  → 合影轮播（G3 mock，G7 切真接口）
 *
 * Plan 对应：M-① ~ M-④ 模块共享数据；fetchAll = Promise.allSettled，
 * 任何单源失败不阻塞其它分区渲染（spec AC-15 体感：网络抖动时优先呈现已就绪部分）。
 *
 * 缓存策略：
 *   - 内存缓存（页内单次拉取）；学生 / 老师 schema 升级后由调用方手动 `refresh()`
 *   - 不持久化（spec/plan 未要求；首屏 < 1 s 即可重拉）
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { listStudents, type StudentSummary } from '@/api/students'
import { listTeachers, type TeacherFull } from '@/api/teachers'
import { listBanners, type Banner } from '@/api/banners'

export type SectionStatus = 'idle' | 'loading' | 'ready' | 'error'

interface SectionState<T> {
  status: SectionStatus
  data: T
  error: string | null
}

function makeSection<T>(initial: T): SectionState<T> {
  return { status: 'idle', data: initial, error: null }
}

export const useClassDataStore = defineStore('classData', () => {
  const students = ref<SectionState<StudentSummary[]>>(makeSection<StudentSummary[]>([]))
  const teachers = ref<SectionState<TeacherFull[]>>(makeSection<TeacherFull[]>([]))
  const banners = ref<SectionState<Banner[]>>(makeSection<Banner[]>([]))

  // 整体三段是否都已 ready / error（供调试 / 异常态降级）
  const allReady = computed(
    () =>
      students.value.status === 'ready' &&
      teachers.value.status === 'ready' &&
      banners.value.status === 'ready',
  )
  const anyLoading = computed(
    () =>
      students.value.status === 'loading' ||
      teachers.value.status === 'loading' ||
      banners.value.status === 'loading',
  )

  /** 学生头像墙：根据 id 找单个学生（StudentDetail.vue / 主态判定备用） */
  const studentMap = computed(() => {
    const m = new Map<number, StudentSummary>()
    for (const s of students.value.data) m.set(s.id, s)
    return m
  })

  async function fetchStudents(force = false) {
    if (!force && students.value.status === 'ready') return
    students.value.status = 'loading'
    students.value.error = null
    try {
      students.value.data = await listStudents()
      students.value.status = 'ready'
    } catch (e) {
      students.value.error = (e as Error)?.message || 'listStudents failed'
      students.value.status = 'error'
    }
  }

  async function fetchTeachers(force = false) {
    if (!force && teachers.value.status === 'ready') return
    teachers.value.status = 'loading'
    teachers.value.error = null
    try {
      teachers.value.data = await listTeachers()
      teachers.value.status = 'ready'
    } catch (e) {
      teachers.value.error = (e as Error)?.message || 'listTeachers failed'
      teachers.value.status = 'error'
    }
  }

  async function fetchBanners(force = false) {
    if (!force && banners.value.status === 'ready') return
    banners.value.status = 'loading'
    banners.value.error = null
    try {
      banners.value.data = await listBanners()
      banners.value.status = 'ready'
    } catch (e) {
      banners.value.error = (e as Error)?.message || 'listBanners failed'
      banners.value.status = 'error'
    }
  }

  /** 三段并发拉取；任何一段失败不阻塞其它（plan M-① ~ M-④） */
  async function fetchAll(force = false) {
    await Promise.allSettled([fetchStudents(force), fetchTeachers(force), fetchBanners(force)])
  }

  function reset() {
    students.value = makeSection<StudentSummary[]>([])
    teachers.value = makeSection<TeacherFull[]>([])
    banners.value = makeSection<Banner[]>([])
  }

  return {
    // state
    students,
    teachers,
    banners,
    // getters
    allReady,
    anyLoading,
    studentMap,
    // actions
    fetchStudents,
    fetchTeachers,
    fetchBanners,
    fetchAll,
    reset,
  }
})
