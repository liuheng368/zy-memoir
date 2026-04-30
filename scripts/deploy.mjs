#!/usr/bin/env node
/**
 * scripts/deploy.mjs — CloudBase 部署引导脚本（plan G12）
 *
 * 设计目标：
 *   1. **不**在仓库内固化 secret，也不引入 `@cloudbase/cli` 作为强依赖；
 *   2. 校验 envId / dist / cloudbaserc.json 三件套是否就绪；
 *   3. 打印一键复制的 `npx @cloudbase/cli` 命令清单（device-code 登录 + 一站部署）；
 *   4. 任何异常退出码非 0，便于 CI 早失败。
 *
 * 用法：
 *   pnpm deploy                       # 默认全量部署（静态站 + 全部云函数）
 *   pnpm deploy --only static         # 仅静态站
 *   pnpm deploy --only fn             # 仅云函数
 *   pnpm deploy --skip-build          # 跳过 pnpm build（已经构建过）
 *
 * 不直接 spawn `npx @cloudbase/cli`，把决定权交给开发者，避免设备码登录环节卡 stdin。
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

const args = process.argv.slice(2)
const flags = {
  only: 'all', // 'all' | 'static' | 'fn'
  skipBuild: false,
}
for (let i = 0; i < args.length; i += 1) {
  const a = args[i]
  if (a === '--only' && args[i + 1]) {
    flags.only = args[i + 1]
    i += 1
  } else if (a === '--skip-build') {
    flags.skipBuild = true
  }
}

if (!['all', 'static', 'fn'].includes(flags.only)) {
  console.error(`[deploy] --only 只支持 all | static | fn，收到: ${flags.only}`)
  process.exit(1)
}

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
} else {
  console.warn('[deploy] 未发现 .env.production；如果 dist 已经构建可以忽略')
}

if (flags.only !== 'fn' && !flags.skipBuild) {
  console.log('[deploy] step 1：校验 dist 是否已构建（若未构建请先 `pnpm build`）')
  const DIST = path.join(ROOT, 'dist')
  const hasIndex = existsSync(path.join(DIST, 'index.html'))
  if (!hasIndex) {
    console.error('[deploy] dist/index.html 不存在；先运行 `pnpm build`，或加 --skip-build')
    process.exit(1)
  }
  const stat = statSync(path.join(DIST, 'index.html'))
  console.log(`[deploy] dist/index.html OK，构建于 ${stat.mtime.toISOString()}`)
}

console.log('')
console.log(`[deploy] envId = ${envId}`)
console.log(`[deploy] mode  = ${flags.only}`)
console.log('')
console.log('=== 接下来按顺序执行下列命令（device-code 登录会弹浏览器） ===')
console.log('')

// 第一次登录：device-code（会弹浏览器，安全 + 无需手填 SECRET_ID/KEY）
console.log('# 1) 首次部署或 token 过期时执行：device-code 登录')
console.log('npx -y @cloudbase/cli login')
console.log('')

if (flags.only === 'all' || flags.only === 'static') {
  console.log('# 2) 部署静态站（plugin "client"）')
  console.log(`npx -y @cloudbase/cli framework deploy -e ${envId} --only client`)
  console.log('')
}
if (flags.only === 'all' || flags.only === 'fn') {
  console.log('# 3) 部署云函数（plugin "functions"，会读取 cloudbaserc.json 的 functions[]）')
  console.log(`npx -y @cloudbase/cli framework deploy -e ${envId} --only functions`)
  console.log('')
  console.log('# 3.1) 单独部署单个云函数（按需）')
  console.log(`#      npx -y @cloudbase/cli fn deploy <functionName> -e ${envId} --force`)
  console.log('')
}

console.log('# 4) 静态站完成后会输出托管域名，例：')
console.log(`#    https://${envId}.tcloudbaseapp.com/`)
console.log('')
console.log('[deploy] 引导生成完毕。如需自动 spawn 命令，请改写本脚本启用 child_process.spawn。')
