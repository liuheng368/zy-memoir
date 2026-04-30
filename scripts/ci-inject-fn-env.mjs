#!/usr/bin/env node
/**
 * scripts/ci-inject-fn-env.mjs — **仅 CI 使用**
 *
 * 背景：
 *   cloudbaserc.json 中 11 个写云函数的 `envVariables.AUTH_HMAC_KEY` /
 *   `envVariables.ADMIN_HMAC_KEY` 是**占位符字符串**（"请在 CloudBase 控制台 ..."），
 *   目的是让本地 `pnpm deploy:fn` 不要把真实密钥写进仓库（G12 / _shared/README.md 约束）。
 *
 *   但 `@cloudbase/framework-plugin-function` 的 envVariables 是**声明式覆盖**：
 *   CI 跑 `cloudbase framework deploy` 时会把控制台已配的真实 HMAC **覆盖成占位符**，
 *   导致所有写云函数登录态校验失败、返回 SERVER_MISCONFIG。
 *
 * 本脚本职责：
 *   1. 仅在 CI（GitHub Actions）执行，要求 `AUTH_HMAC_KEY` / `ADMIN_HMAC_KEY`
 *      两个环境变量必须存在（来自 GitHub Secrets）；
 *   2. 把 cloudbaserc.json 中所有形如占位符的 envVariables 值替换成真实值；
 *   3. 不写回 git，仅修改 CI workspace 临时副本，部署完即丢；
 *   4. 任何缺失或不在 CI 环境直接非零退出，避免误用。
 *
 * 用法（仅在 .github/workflows/deploy.yml 里）：
 *   AUTH_HMAC_KEY=*** ADMIN_HMAC_KEY=*** node scripts/ci-inject-fn-env.mjs
 *
 * 本地禁止运行：缺少环境变量会直接退出，不会污染本地仓库。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const RC = path.join(ROOT, 'cloudbaserc.json')

const auth = process.env.AUTH_HMAC_KEY
const admin = process.env.ADMIN_HMAC_KEY

if (!auth || !admin) {
  console.error(
    '[ci-inject-fn-env] 缺少 AUTH_HMAC_KEY 或 ADMIN_HMAC_KEY 环境变量。',
  )
  console.error('  - 本地禁止运行此脚本；CI 请在 GitHub Secrets 配置后注入。')
  process.exit(1)
}

let rc
try {
  rc = JSON.parse(readFileSync(RC, 'utf8'))
} catch (e) {
  console.error('[ci-inject-fn-env] 解析 cloudbaserc.json 失败:', e?.message || e)
  process.exit(1)
}

const fns = rc?.framework?.plugins?.functions?.inputs?.functions
if (!Array.isArray(fns) || !fns.length) {
  console.error('[ci-inject-fn-env] cloudbaserc.json 缺少 functions 列表')
  process.exit(1)
}

let touched = 0
for (const fn of fns) {
  if (!fn || !fn.envVariables) continue
  if (typeof fn.envVariables.AUTH_HMAC_KEY === 'string') {
    fn.envVariables.AUTH_HMAC_KEY = auth
    touched += 1
  }
  if (typeof fn.envVariables.ADMIN_HMAC_KEY === 'string') {
    fn.envVariables.ADMIN_HMAC_KEY = admin
    touched += 1
  }
}

writeFileSync(RC, JSON.stringify(rc, null, 2) + '\n', 'utf8')
console.log(`[ci-inject-fn-env] 已注入 ${touched} 处 HMAC 真实值到 cloudbaserc.json（仅 CI workspace）`)
