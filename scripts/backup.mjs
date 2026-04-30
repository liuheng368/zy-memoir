#!/usr/bin/env node
/**
 * scripts/backup.mjs — 月度备份引导脚本（plan G12 · 风险表「数据所有权 / 续费」缓解措施）
 *
 * 职责（按 plan 描述）：
 *   1. 列出仓库内所有数据库集合（students / teachers / banners）的 `tcb db:export` 命令；
 *   2. 列出 COS bucket 备份命令清单（学生 / 老师 / 合影资源）；
 *   3. **打印 P0 免费包 `free-free-std_storage-1777532470-0` 距离到期日 2026-10-31 的剩余天数**，
 *      ≤ 30 天高亮提醒「准备续 P0 vs 滚 P1」（见 plan「### 存储 / COS 资源包消耗策略」）；
 *   4. 不依赖 `@cloudbase/manager-node`（避免引入额外重 dep）；
 *   5. 同 deploy.mjs，**只生成清单**，由开发者自行执行 / 把命令塞 cron。
 *
 * 用法：
 *   pnpm backup                    # 仅生成清单 + 剩余天数告警（默认）
 *   pnpm backup --out backups/2026-04
 *   pnpm backup --p0-deadline 2026-10-31  # 显式覆盖 P0 到期日（默认按 plan 写死）
 *
 * 退出码：
 *   0 — 一切就绪
 *   2 — P0 包剩余 ≤ 30 天，需要尽快决策
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

const args = process.argv.slice(2)
const flags = {
  out: 'backups',
  p0Deadline: '2026-10-31',
}
for (let i = 0; i < args.length; i += 1) {
  const a = args[i]
  if (a === '--out' && args[i + 1]) {
    flags.out = args[i + 1]
    i += 1
  } else if (a === '--p0-deadline' && args[i + 1]) {
    flags.p0Deadline = args[i + 1]
    i += 1
  }
}

const RC_PATH = path.join(ROOT, 'cloudbaserc.json')
if (!existsSync(RC_PATH)) {
  console.error('[backup] 找不到 cloudbaserc.json，确认在仓库根目录执行')
  process.exit(1)
}
let envId
try {
  envId = JSON.parse(readFileSync(RC_PATH, 'utf8'))?.envId
} catch (e) {
  console.error('[backup] 解析 cloudbaserc.json 失败:', e?.message || e)
  process.exit(1)
}
if (!envId) {
  console.error('[backup] cloudbaserc.json 缺少 envId')
  process.exit(1)
}

/* -------------------- P0 包剩余天数 -------------------- */
const today = new Date()
today.setUTCHours(0, 0, 0, 0)
const deadline = new Date(`${flags.p0Deadline}T00:00:00Z`)
if (Number.isNaN(deadline.getTime())) {
  console.error(`[backup] --p0-deadline 不是合法日期: ${flags.p0Deadline}`)
  process.exit(1)
}
const daysLeft = Math.ceil((deadline.getTime() - today.getTime()) / (24 * 3600 * 1000))

console.log('=========================================')
console.log(`[backup] envId         = ${envId}`)
console.log(`[backup] today         = ${today.toISOString().slice(0, 10)}`)
console.log(`[backup] P0 deadline   = ${flags.p0Deadline}`)
console.log(`[backup] P0 days left  = ${daysLeft} 天`)
if (daysLeft <= 0) {
  console.log('[backup] ⛔ P0 已过期：请确认是否已切换至 P1 std_storage-20260430782142354409091-0')
} else if (daysLeft <= 30) {
  console.log('[backup] ⚠️  P0 包剩余 ≤ 30 天：请按 plan「### 存储 / COS 资源包消耗策略」决策续 P0 或滚 P1')
} else {
  console.log('[backup] ✅ P0 包仍在安全期')
}
console.log('=========================================')
console.log('')

/* -------------------- 集合清单（plan 数据库设计） -------------------- */
const COLLECTIONS = ['students', 'teachers', 'banners']
const month = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`
const outDir = path.join(ROOT, flags.out, month)
try {
  mkdirSync(outDir, { recursive: true })
} catch (e) {
  console.error('[backup] 创建输出目录失败:', e?.message || e)
  process.exit(1)
}

console.log('=== 数据库集合备份命令（按需粘贴执行）===')
const dbCmds = []
for (const c of COLLECTIONS) {
  const file = path.join(flags.out, month, `${c}.json`)
  const cmd = `npx -y @cloudbase/cli db:export --collection ${c} --filePath ${file} -e ${envId}`
  console.log(cmd)
  dbCmds.push(cmd)
}
console.log('')

/* -------------------- COS 备份命令（学生 / 老师 / 合影） -------------------- */
const COS_PATHS = [
  { label: 'students/', desc: '学生头像 / 照片 / 录音' },
  { label: 'teachers/', desc: '老师头像 / 录音' },
  { label: 'banners/', desc: '合影' },
]

console.log('=== COS 文件备份命令（按需粘贴执行）===')
const cosCmds = []
for (const p of COS_PATHS) {
  const localDir = path.join(flags.out, month, 'cos', p.label)
  const cmd = `npx -y @cloudbase/cli storage:download ${p.label} ${localDir} -e ${envId}  # ${p.desc}`
  console.log(cmd)
  cosCmds.push(cmd)
}
console.log('')

/* -------------------- 落盘清单 + Manifest -------------------- */
const manifest = {
  envId,
  generatedAt: new Date().toISOString(),
  p0Deadline: flags.p0Deadline,
  p0DaysLeft: daysLeft,
  outDir: path.relative(ROOT, outDir),
  collections: COLLECTIONS,
  cosPaths: COS_PATHS.map((p) => p.label),
  dbCommands: dbCmds,
  cosCommands: cosCmds,
  notes: [
    '本脚本不调用 SDK，只生成命令清单 + 提醒；',
    '执行前需 `npx @cloudbase/cli login` 完成 device-code 登录；',
    'COS 文件较多（数百张照片）时建议分目录跑，避免单次超时。',
  ],
}
const manifestPath = path.join(outDir, 'manifest.json')
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
console.log(`[backup] 备份清单已写入: ${path.relative(ROOT, manifestPath)}`)
console.log(`[backup] 实际备份文件请执行上方命令后落到: ${path.relative(ROOT, outDir)}/`)
console.log('')

if (daysLeft <= 30) {
  process.exit(2) // 高亮提醒：让 cron / CI 触发通知
}
