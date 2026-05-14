/**
 * CloudBase JS SDK 单例封装（@cloudbase/js-sdk v2.x）
 *
 * - 环境 ID 来自 `import.meta.env.VITE_TCB_ENV_ID`（与 cloudbaserc.json 保持一致）
 * - 鉴权：plan.md Q-PLAN-8 = 方案 A —— CloudBase 匿名鉴权 + 自定义云函数发短期 token；
 *   写权限由云函数侧二次校验，前端 `isReadOnly` 仅作 UI 收口（spec Q17 / plan G14）
 * - 持久化：LocalStorage（spec Q11 = 永不过期）；游客态另走 sessionStorage（spec Q17 持久化方案 B）
 *
 * 暴露：
 *   - `getApp()` / `getAuth()` / `getDB()` / `getStorage()`：惰性初始化的官方实例
 *   - `callFunction()` / `getCollection()`：常用快捷方式
 */
import cloudbase from '@cloudbase/js-sdk'

type App = ReturnType<typeof cloudbase.init>
type Auth = ReturnType<App['auth']>
type Database = ReturnType<App['database']>
// SDK v2.28 起 `app.storage` 为属性对象（Supabase 风格），不再是函数
type Storage = App['storage']

let _app: App | null = null
let _auth: Auth | null = null
let _anonAuthPromise: Promise<void> | null = null

/** 读取环境 ID；未配置时抛出可定位的错误，避免静默 401 */
function readEnvId(): string {
  const envId = import.meta.env.VITE_TCB_ENV_ID
  if (!envId || envId.trim() === '') {
    throw new Error(
      '[cloudbase] VITE_TCB_ENV_ID is empty — 请检查根目录 .env / .env.production 是否落盘',
    )
  }
  return envId
}

/** 获取（或惰性初始化）CloudBase App 单例 */
export function getApp(): App {
  if (_app) return _app
  _app = cloudbase.init({ env: readEnvId() })
  return _app
}

/** 获取 Auth 实例（持久化策略 = local，即 LocalStorage） */
export function getAuth(): Auth {
  if (_auth) return _auth
  _auth = getApp().auth({ persistence: 'local' })
  return _auth
}

/** 获取 Database 实例 */
export function getDB(): Database {
  return getApp().database()
}

/**
 * 确保已发起 CloudBase 匿名登录（plan.md Q-PLAN-8 方案 A）
 *
 * - 幂等：同一进程内只发起一次（即使并发调用也共享同一个 Promise）；
 * - 已有任意登录态（匿名 / 学生 token / 老师 token / admin）则直接 resolve；
 * - 失败时清空缓存以便上层重试（避免一次失败永久卡死）；
 * - **不**阻塞 SPA 渲染，而是在第一次 `callFunction` / `getStorage` 等真实调用前 await。
 *
 * CloudBase Web SDK v2.x 调云函数 / 写存储前必须有用户态，
 * 否则会被 CloudBase 网关返回 INVALID_USER / 调用拒绝。
 */
export async function ensureAnonAuth(): Promise<void> {
  if (_anonAuthPromise) return _anonAuthPromise
  _anonAuthPromise = (async () => {
    const auth = getAuth()
    const loginState = await auth.getLoginState()
    if (loginState) return // 已经有任意登录态（含 LocalStorage 持久化的匿名态）
    const provider = auth.anonymousAuthProvider()
    await provider.signIn()
  })().catch((err) => {
    _anonAuthPromise = null
    throw err
  })
  return _anonAuthPromise
}

/**
 * 获取存储（COS）实例（v2.28+ Supabase 风格 `from('bucket').uploadFile(...)`）。
 * 旧接口 `app.uploadFile / downloadFile / deleteFile` 也仍可在 `getApp()` 上直接使用。
 */
export function getStorage(): Storage {
  return getApp().storage
}

/**
 * 调用云函数（统一入口；后续可在此追加日志 / 错误码归一）
 *
 * @example
 *   const res = await callFunction<{ ok: true; token: string }>('studentLogin', { id: 12, name: '李苏' })
 */
export async function callFunction<TResult = unknown>(
  name: string,
  data?: object,
): Promise<TResult> {
  await ensureAnonAuth()
  const res = await getApp().callFunction({
    name,
    data: data as Record<string, unknown> | undefined,
  })
  // CloudBase 云函数错误时通常 throws；result 即云函数 return 值
  return res.result as TResult
}

/** 集合快捷方式 */
export function getCollection(name: string) {
  return getDB().collection(name)
}

/**
 * 仅供测试 / HMR 重置使用，正常业务勿调用。
 */
export function _resetForTest(): void {
  _app = null
  _auth = null
  _anonAuthPromise = null
}

export type { App as CloudBaseApp, Auth as CloudBaseAuth, Database as CloudBaseDatabase, Storage as CloudBaseStorage }
