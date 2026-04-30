'use strict';

/**
 * cloudfunctions/adminCheck/index.js
 *
 * 入参：{ token: string }
 * 出参：
 *   成功 → { ok: true, code: 'ADMIN_OK', data: { profile: { role: 'admin' }, token } }
 *   失败 → { ok: false, code: 'INVALID_INPUT' | 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'SERVER_MISCONFIG', message }
 *
 * Q-PLAN-18 决议：HMAC(ADMIN_HMAC_KEY, ts) 防伪 token，30 天滚动；
 * 管理员 token 由 scripts/sign-admin-token.mjs 离线签发，URL 形如 `/admin?token=<exp>.<body>.<hex>`。
 * 注意：本函数**只验签**，不签发；轮换密钥即可让所有旧 token 失效。
 */

const crypto = require('crypto');

// SYNCED FROM cloudfunctions/_shared/hmac.js
function fromBase64Url(str) {
  const pad = 4 - (str.length % 4);
  const padded = pad === 4 ? str : str + '='.repeat(pad);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function verifyToken(token, secret) {
  if (typeof token !== 'string' || !secret) return { ok: false, reason: 'INVALID_TOKEN' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'INVALID_TOKEN' };
  const [expStr, body, hex] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return { ok: false, reason: 'INVALID_TOKEN' };
  if (exp < Date.now()) return { ok: false, reason: 'EXPIRED_TOKEN' };
  const data = expStr + '.' + body;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('hex');
  if (expected.length !== hex.length) return { ok: false, reason: 'INVALID_TOKEN' };
  let safeEqual = false;
  try {
    safeEqual = crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(hex, 'utf8'));
  } catch (_) {
    return { ok: false, reason: 'INVALID_TOKEN' };
  }
  if (!safeEqual) return { ok: false, reason: 'INVALID_TOKEN' };
  try {
    return { ok: true, payload: JSON.parse(fromBase64Url(body).toString('utf8')) };
  } catch (_) {
    return { ok: false, reason: 'INVALID_TOKEN' };
  }
}

function ok(data, code = 'OK', message = '') { return { ok: true, code, message, data }; }
function fail(code, message = '') { return { ok: false, code, message }; }

exports.main = async (event = {}) => {
  const { token } = event;
  if (typeof token !== 'string' || !token) return fail('INVALID_INPUT', '缺少 token');

  const secret = process.env.ADMIN_HMAC_KEY;
  if (!secret) return fail('SERVER_MISCONFIG', 'ADMIN_HMAC_KEY 未配置');

  const r = verifyToken(token, secret);
  if (!r.ok) return fail(r.reason, r.reason === 'EXPIRED_TOKEN' ? '管理员 token 已过期' : '管理员 token 无效');
  if (!r.payload || r.payload.role !== 'admin') return fail('INVALID_TOKEN', 'token 角色不匹配');

  return ok({ profile: { role: 'admin' }, token }, 'ADMIN_OK', '管理员校验通过');
};
