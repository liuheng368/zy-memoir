'use strict';

/**
 * cloudfunctions/addBanner/index.js
 *
 * plan API-19 / Q-PLAN-22 / spec Q22：主页合影上传（v0.6 老师 + 管理员共用）。
 * 入参：{ token, fileID, url?, caption? }
 *   - 前端先 useImageCompress + useUpload 拿到 fileID 后再调本函数；
 *   - 云函数侧不再做体积校验，仅做角色与字段校验。
 * 出参：
 *   成功 → { ok: true, code: 'BANNER_OK', data: { banner: {...} } }
 *   失败 → { ok: false, code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'WRITE_ERROR' | 'SERVER_MISCONFIG' }
 *
 * 鉴权（v0.6 双 HMAC key 验签）：
 *   1. 优先 ADMIN_HMAC_KEY → payload.role === 'admin' 放行；
 *   2. 失败再 AUTH_HMAC_KEY → payload.role === 'teacher' 放行；
 *   3. 其他一律 UNAUTHORIZED / FORBIDDEN；
 *   4. uploadedBy 字段写实际操作角色：'admin' / 'teacher:<teacherId>'，仅追溯不参与判定。
 */

const tcb = require('@cloudbase/node-sdk');
const crypto = require('crypto');

// SYNCED FROM cloudfunctions/_shared/hmac.js
function fromBase64Url(str) {
  const pad = 4 - (str.length % 4);
  const padded = pad === 4 ? str : str + '='.repeat(pad);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function verifyToken(token, secret) {
  if (typeof token !== 'string' || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [expStr, body, hex] = parts;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const data = expStr + '.' + body;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('hex');
  if (expected.length !== hex.length) return null;
  let safeEqual = false;
  try {
    safeEqual = crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(hex, 'utf8'));
  } catch (_) { return null; }
  if (!safeEqual) return null;
  try { return JSON.parse(fromBase64Url(body).toString('utf8')); } catch (_) { return null; }
}
function ok(data, code = 'OK', message = '') { return { ok: true, code, message, data }; }
function fail(code, message = '') { return { ok: false, code, message }; }

const MAX_CAPTION = 60;

exports.main = async (event = {}) => {
  // v0.6 双 HMAC key 验签：先 ADMIN_HMAC_KEY → admin；失败再 AUTH_HMAC_KEY → teacher
  const adminKey = process.env.ADMIN_HMAC_KEY;
  const authKey = process.env.AUTH_HMAC_KEY;
  if (!adminKey && !authKey) return fail('SERVER_MISCONFIG', 'ADMIN_HMAC_KEY / AUTH_HMAC_KEY 均未配置');

  let payload = null;
  let viaRole = null; // 'admin' | 'teacher'
  if (adminKey) {
    const p = verifyToken(event.token, adminKey);
    if (p && p.role === 'admin') { payload = p; viaRole = 'admin'; }
  }
  if (!payload && authKey) {
    const p = verifyToken(event.token, authKey);
    if (p && p.role === 'teacher') { payload = p; viaRole = 'teacher'; }
  }
  if (!payload) return fail('UNAUTHORIZED', '登录态失效，请重新登录');
  if (viaRole !== 'admin' && viaRole !== 'teacher') return fail('FORBIDDEN', '需要管理员或老师身份');

  const { fileID } = event;
  if (typeof fileID !== 'string' || !fileID.trim()) return fail('INVALID_INPUT', '缺少 fileID');
  const caption = typeof event.caption === 'string' ? event.caption.trim().slice(0, MAX_CAPTION) : '';
  const url = typeof event.url === 'string' ? event.url : '';

  // uploadedBy：管理员 'admin'；老师 'teacher:<teacherId>'（teacherId 缺失时退化为 'teacher'）
  const uploadedBy = viaRole === 'admin'
    ? 'admin'
    : (payload.teacherId !== undefined && payload.teacherId !== null
        ? 'teacher:' + payload.teacherId
        : 'teacher');

  try {
    const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
    const db = app.database();
    const now = Date.now();
    const doc = {
      fileID,
      url,
      caption,
      createdAt: now,
      uploadedBy,
      updatedAt: now
    };
    const r = await db.collection('banners').add(doc);
    const _id = r && (r.id || r._id);
    return ok({ banner: { id: _id, ...doc } }, 'BANNER_OK', '');
  } catch (e) {
    return fail('WRITE_ERROR', String((e && e.message) || e));
  }
};
