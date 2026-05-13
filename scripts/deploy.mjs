#!/usr/bin/env node
/**
 * scripts/deploy.mjs — CloudBase 云函数部署引导脚本
 *
 * 设计目标：
 *   1. **不**在仓库内固化 secret，也不引入 `@cloudbase/cli` 作为强依赖；
 *   2. 校验 envId / cloudbaserc.json 是否就绪；
 *   3. 打印一键复制的 `npx @cloudbase/cli` 命令清单（device-code 登录 + 云函数部署）；
 *   4. 任何异常退出码非 0，便于 CI 早失败。
 *
 * 用法：
 *   pnpm run deploy:fn                # 部署全部 CloudBase 云函数
 *
 * 不直接 spawn `npx @cloudbase/cli`，把决定权交给开发者，避免设备码登录环节卡 stdin。
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

const RC_PATH = path.join(ROOT, 'cloudbaserc.json')
if (!existsSync(RC_PATH)) {
  console.error('[deploy] 找不到 cloudbaserc.json，确认在仓库根目录执行')
  process.exit(1)
}
let rc
try {
  rc = JSON.parse(readFileSync(RC_PATH, 'utf8'))
} catch (e) {
  console.error('[deploy] 解析 cloudbaserc.json 失败:', e?.message || e)
  process.exit(1)
}
const envId = rc?.envId
if (!envId || typeof envId !== 'string') {
  console.error('[deploy] cloudbaserc.json 缺少 envId（应为 zy-memoir-d5gaxbvyxe80564f4）')
  process.exit(1)
}

// .env.production 与 cloudbaserc.json 必须保持一致（plan §架构 / 安全）
const ENV_PROD = path.join(ROOT, '.env.production')
if (existsSync(ENV_PROD)) {
  const text = readFileSync(ENV_PROD, 'utf8')
  const m = text.match(/^VITE_TCB_ENV_ID\s*=\s*"?([^"\n\r]+)"?/m)
  const envInProd = m?.[1]?.trim()
  if (envInProd && envInProd !== envId) {
    console.error(
      `[deploy] .env.production 的 VITE_TCB_ENV_ID="${envInProd}" 与 cloudbaserc.json envId="${envId}" 不一致`,
    )
    process.exit(1)
  }
}

console.log('')
console.log(`[deploy] envId = ${envId}`)
console.log('[deploy] target = cloud functions')
console.log('')
console.log('=== 接下来按顺序执行下列命令（device-code 登录会弹浏览器） ===')
console.log('')

// 第一次登录：device-code（会弹浏览器，安全 + 无需手填 SECRET_ID/KEY）
console.log('# 1) 首次部署或 token 过期时执行：device-code 登录')
console.log('npx -y @cloudbase/cli login')
console.log('')

console.log('# 2) 部署云函数（plugin "functions"，会读取 cloudbaserc.json 的 functions[]）')
console.log(`npx -y @cloudbase/cli framework deploy -e ${envId} --only functions`)
console.log('')
console.log('# 2.1) 单独部署单个云函数（按需）')
console.log(`#      npx -y @cloudbase/cli fn deploy <functionName> -e ${envId} --force`)
console.log('')
console.log('[deploy] 引导生成完毕。如需自动 spawn 命令，请改写本脚本启用 child_process.spawn。')
