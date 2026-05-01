#!/usr/bin/env node
/**
 * scripts/sign-admin.mjs — pnpm sign:admin 友好 wrapper
 *
 * 流程：
 *   1) 优先用环境变量 ADMIN_HMAC_KEY（CI / 离线场景）
 *   2) 否则通过 mcporter 调 cloudbase.queryFunctions 自动从 adminCheck 云函数读取
 *   3) 拿到 key 后调用底层 scripts/sign-admin-token.mjs 完成签发
 *
 * 使用：
 *   pnpm sign:admin            # 默认 30 天
 *   pnpm sign:admin --days 7   # 7 天
 *   pnpm sign:admin --days 90  # 90 天
 *
 * CI / 离线场景（无 mcporter / 不希望走云查询）请直接：
 *   ADMIN_HMAC_KEY="xxx" pnpm sign:admin:env --days 30
 *   等价于 ADMIN_HMAC_KEY="xxx" node scripts/sign-admin-token.mjs --days 30
 *
 * 前置：
 *   - 已通过 mcporter 完成 cloudbase 登录（device-code / web）
 *   - 已 set_env zy-memoir-d5gaxbvyxe80564f4
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SIGN_SCRIPT = path.join(__dirname, 'sign-admin-token.mjs')

function fetchKeyFromCloudBase() {
  process.stderr.write('[sign:admin] 未设置 ADMIN_HMAC_KEY 环境变量，正在从 CloudBase adminCheck 云函数读取…\n')
  const r = spawnSync(
    'npx',
    [
      'mcporter', 'call', 'cloudbase.queryFunctions',
      '--args', JSON.stringify({ action: 'getFunctionDetail', functionName: 'adminCheck' }),
      '--output', 'json',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  if (r.status !== 0) {
    process.stderr.write('[sign:admin] mcporter 调用失败：\n' + (r.stderr || '') + '\n')
    process.stderr.write('请先执行 `npx mcporter call cloudbase.auth action=status` 确认登录态\n')
    process.exit(1)
  }
  // mcporter 返回的 JSON 体积大且嵌套深（含云函数完整 CodeInfo 字段，
  // 内嵌特殊字符可能导致 JSON.parse 失败），改用正则直接抽取目标值，更鲁棒
  // 匹配形如：{"Key":"ADMIN_HMAC_KEY","Value":"...."}
  const m = r.stdout.match(/"Key"\s*:\s*"ADMIN_HMAC_KEY"\s*,\s*"Value"\s*:\s*"([^"]+)"/)
  if (!m || !m[1]) {
    process.stderr.write('[sign:admin] 未在 adminCheck 云函数环境变量中找到 ADMIN_HMAC_KEY\n')
    process.stderr.write('请到 CloudBase 控制台或用 mcp 配置该环境变量\n')
    process.stderr.write('原始 stdout（前 400 字符）: ' + r.stdout.slice(0, 400) + '\n')
    process.exit(1)
  }
  const value = m[1]
  process.stderr.write('[sign:admin] 已从 CloudBase 拉到 ADMIN_HMAC_KEY（长度 ' + value.length + '）\n\n')
  return value
}

const key = process.env.ADMIN_HMAC_KEY || fetchKeyFromCloudBase()

const passthrough = process.argv.slice(2)
const r = spawnSync('node', [SIGN_SCRIPT, ...passthrough], {
  env: { ...process.env, ADMIN_HMAC_KEY: key },
  stdio: 'inherit',
})
process.exit(r.status ?? 0)
