#!/usr/bin/env node
/**
 * 批量修复 CloudBase 云函数 SecurityRule，允许已登录用户（含匿名）调用。
 *
 * 背景（plan.md Q-PLAN-8 方案 A 配套运维）：
 *   CloudBase 控制台默认 SecurityRule 模板会自动给云函数下发：
 *     {"*":{"invoke":"auth != null && auth.loginType != 'ANONYMOUS'"}}
 *   该规则禁止匿名用户调用任何云函数 → 前端 Web SDK 走匿名鉴权后调
 *   listTeachers / listStudents / listBanners / studentLogin 全部 PERMISSION_DENIED。
 *
 * 本项目入口函数（含 studentLogin / teacherLogin）必须允许匿名访问；写函数的真正
 * 权限校验由云函数内部 verifyAdminToken / verifyStudentToken（HMAC + 短期 token）
 * 自己完成，外层放宽到 auth != null 不影响安全。
 *
 * 使用：
 *   1) 已登录 CloudBase（任一种）：
 *      - tcb login
 *      - 或 mcporter cloudbase.auth start_auth authMode=device 完成 device-code
 *   2) node scripts/fix-cloudfn-perm.mjs
 *
 * 何时需要重跑：
 *   - 新增云函数（默认会被下发禁匿名规则）
 *   - 控制台被人手动改回默认模板
 *   - 切换/重建环境
 *
 * 依赖：mcporter（已通过 npx 调用，无需全局安装）
 */
import { spawnSync } from 'node:child_process'

const FUNCTIONS = [
  'addBanner', 'addStudentPhoto', 'addStudentRecording', 'addTeacherRecording',
  'adminCheck', 'getStudentDetail', 'listBanners', 'listStudents', 'listTeachers',
  'removeBanner', 'removeStudentPhoto', 'removeStudentRecording', 'removeTeacherRecording',
  'seedStudents', 'seedTeachers', 'studentLogin', 'teacherLogin',
  'updateStudentAvatar', 'updateStudentIntro', 'updateTeacherAvatar',
]

const SECURITY_RULE = JSON.stringify({ '*': { invoke: 'auth != null' } })

let okCount = 0
let failCount = 0
for (const fn of FUNCTIONS) {
  const args = JSON.stringify({
    action: 'updateResourcePermission',
    resourceType: 'function',
    resourceId: fn,
    permission: 'CUSTOM',
    securityRule: SECURITY_RULE,
  })
  const r = spawnSync(
    'npx',
    ['mcporter', 'call', 'cloudbase.managePermissions', '--args', args, '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const out = (r.stdout || '') + (r.stderr || '')
  const ok = /资源权限更新成功|"success"\s*:\s*true/i.test(out)
  const msg = (out.match(/"message"\s*:\s*"([^"]+)"/) || [, ''])[1]
  console.log(`${ok ? '✓' : '✗'} ${fn.padEnd(24)} ${msg}`)
  if (ok) okCount++
  else failCount++
}

console.log(`\nDone: ${okCount} ok, ${failCount} failed (total ${FUNCTIONS.length})`)
process.exit(failCount === 0 ? 0 : 1)
