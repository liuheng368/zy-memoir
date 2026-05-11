/**
 * 路由（Q-PLAN-4 = history 模式）
 *
 * 三路由对应三视图，URL 直接区分角色（plan v0.3 决议）：
 *   - `/`           → 学生入口（视图 = `views/StudentLogin.vue`，内含主页 + 学生登录浮层）
 *   - `/teacher`    → 老师入口（视图 = `views/TeacherLogin.vue`，内含主页 + 老师登录浮层）
 *   - `/admin`      → 主页合影管理（v0.6 老师 + 管理员共用；管理员走 `?token=` 校验，老师走已有 `AUTH_HMAC_KEY` token 直入；guest / 学生拒绝）
 *
 * 守卫职责（G3 骨架）：
 *   1. 同步路由 meta.title → document.title
 *   2. `/admin` 拒绝 `role==='guest'`；持有合影管理权限（老师 / 管理员）放行；管理员缺 token 跳 `/`
 *   3. 学生 / 老师入口本身**不阻塞**未登录访问；登录浮层由 view 自己根据 authStore 控制
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { ROUTES } from '@/utils/constants'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: ROUTES.HOME,
    name: 'home',
    component: () => import('@/views/StudentLogin.vue'),
    meta: { title: '钟园幼儿园 2024 届大二班 · 班级回忆录', entry: 'student' as const },
  },
  {
    path: ROUTES.TEACHER,
    name: 'teacher-login',
    component: () => import('@/views/TeacherLogin.vue'),
    meta: { title: '老师入口 · 班级回忆录', entry: 'teacher' as const },
  },
  {
    path: ROUTES.ADMIN,
    name: 'admin',
    component: () => import('@/views/Admin.vue'),
    meta: { title: '主页合影管理 · 班级回忆录', entry: 'admin' as const, requiresToken: true },
  },
  {
    // 兜底：未知路径回首页
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    redirect: ROUTES.HOME,
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  // /admin 拒绝游客（plan G3 / spec Q17）；老师 / 管理员持 token 放行（v0.6）
  if (to.meta.requiresToken) {
    if (auth.isGuest) {
      return { path: ROUTES.HOME, query: { reason: 'guest-rejected' }, replace: true }
    }
    const tokenInQuery = typeof to.query.token === 'string' ? to.query.token.trim() : ''
    // v0.6：老师 / 管理员均持 token 即可（canManageBanners 已收敛 role + token 双重校验）；
    // 仅当既无 ?token= query 又非合影管理角色时拒绝
    if (!tokenInQuery && !auth.canManageBanners) {
      return { path: ROUTES.HOME, replace: true }
    }
  }

  return true
})

router.afterEach((to) => {
  const title = (to.meta.title as string | undefined) ?? '班级回忆录'
  if (typeof document !== 'undefined') {
    document.title = title
  }
})

export default router
