#!/usr/bin/env node
/**
 * scripts/sign-admin-token.mjs — 底层签发器（CI / 离线场景使用）
 *
 * 与 cloudfunctions/adminCheck 共用 HMAC 协议：HMAC(SHA-256, ADMIN_HMAC_KEY)，
 * payload = base64url(JSON({role:'admin', issuedAt})), 30 天滚动过期可调。
 *
 * 用法（必须显式传 ADMIN_HMAC_KEY 环境变量）：
 *   ADMIN_HMAC_KEY="xxxxx" node scripts/sign-admin-token.mjs            # 默认 30 天
 *   ADMIN_HMAC_KEY="xxxxx" node scripts/sign-admin-token.mjs --days 7   # 自定义天数
 *   或： ADMIN_HMAC_KEY="xxxxx" pnpm sign:admin:env --days 7
 *
 * 本地推荐改用 wrapper 让脚本自动从 CloudBase 拉 key：
 *   pnpm sign:admin --days 30
 *   见 scripts/sign-admin.mjs（背后仍调本脚本）。
 *
 * 输出：
 *   已签发 admin token：
 *   1745948000000.eyJyb2xlIjoiYWRtaW4iLCJ0cyI6MX0.0123456789abcdef...
 *
 *   将 URL 形如 `/admin?token=<上面这串>` 发给管理员，浏览器访问即可登录。
 *   若要让所有旧 token 立即失效：在 CloudBase 控制台 / mcp 中替换 ADMIN_HMAC_KEY 即可。
 */

import crypto from 'node:crypto';

const args = process.argv.slice(2);
let days = 30;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--days' && args[i + 1]) {
    days = Number(args[i + 1]);
    i += 1;
  }
}
if (!Number.isFinite(days) || days <= 0) {
  console.error('[sign-admin-token] --days 必须为正数');
  process.exit(1);
}

const secret = process.env.ADMIN_HMAC_KEY;
if (!secret) {
  console.error('[sign-admin-token] 请设置环境变量 ADMIN_HMAC_KEY（与 CloudBase 云函数 adminCheck 一致）');
  process.exit(1);
}

const ttlMs = days * 24 * 60 * 60 * 1000;
const exp = Date.now() + ttlMs;
const payload = { role: 'admin', issuedAt: Date.now() };

function toBase64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

const body = toBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'));
const data = `${exp}.${body}`;
const hex = crypto.createHmac('sha256', secret).update(data).digest('hex');
const token = `${data}.${hex}`;

const expDate = new Date(exp).toISOString();
console.log('已签发 admin token（有效至 ' + expDate + '）：');
console.log('');
console.log(token);
console.log('');
console.log('URL 示例：/admin?token=' + encodeURIComponent(token));
