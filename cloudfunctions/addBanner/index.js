'use strict';

/**
 * cloudfunctions/addBanner/index.js
 *
 * plan API-19：管理员上传合影。
 * 入参：{ token, fileID, url?, caption? }
 *   - 前端先 useImageCompress + useUpload 拿到 fileID 后再调本函数；
 *   - 云函数侧不再做体积校验，仅做角色与字段校验。
 * 出参：
 *   成功 → { ok: true, code: 'BANNER_OK', data: { banner: {...} } }
 *   失败 → { ok: false, code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'WRITE_ERROR' | 'SERVER_MISCONFIG' }
 *
 * 鉴权：与 adminCheck 共用 ADMIN_HMAC_KEY；token payload.role === 'admin'。
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
  const secret = process.env.ADMIN_HMAC_KEY;
  if (!secret) return fail('SERVER_MISCONFIG', 'ADMIN_HMAC_KEY 未配置');
  const payload = verifyToken(event.token, secret);
  if (!payload) return fail('UNAUTHORIZED', '管理员登录态失效，请重新登录');
  if (payload.role !== 'admin') return fail('FORBIDDEN', '需要管理员身份');

  const { fileID } = event;
  if (typeof fileID !== 'string' || !fileID.trim()) return fail('INVALID_INPUT', '缺少 fileID');
  const caption = typeof event.caption === 'string' ? event.caption.trim().slice(0, MAX_CAPTION) : '';
  const url = typeof event.url === 'string' ? event.url : '';

  try {
    const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
    const db = app.database();
    const now = Date.now();
    const doc = {
      fileID,
      url,
      caption,
      createdAt: now,
      uploadedBy: 'admin',
      updatedAt: now
    };
    const r = await db.collection('banners').add(doc);
    const _id = r && (r.id || r._id);
    return ok({ banner: { id: _id, ...doc } }, 'BANNER_OK', '');
  } catch (e) {
    return fail('WRITE_ERROR', String((e && e.message) || e));
  }
};
