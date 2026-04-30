'use strict';

/**
 * cloudfunctions/removeBanner/index.js
 *
 * plan API-20：管理员删除合影。
 * 入参：{ token, bannerId }
 *   - bannerId 为 banners 集合的 _id
 * 出参：
 *   成功 → { ok: true, code: 'BANNER_REMOVED', data: { bannerId } }
 *   失败 → { ok: false, code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'NOT_FOUND' | 'WRITE_ERROR' | 'SERVER_MISCONFIG' }
 *
 * 鉴权：与 adminCheck 共用 ADMIN_HMAC_KEY；token payload.role === 'admin'。
 * COS 清理：失败静默吞，避免阻塞业务（与 removeStudentPhoto 一致）。
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

exports.main = async (event = {}) => {
  const secret = process.env.ADMIN_HMAC_KEY;
  if (!secret) return fail('SERVER_MISCONFIG', 'ADMIN_HMAC_KEY 未配置');
  const payload = verifyToken(event.token, secret);
  if (!payload) return fail('UNAUTHORIZED', '管理员登录态失效，请重新登录');
  if (payload.role !== 'admin') return fail('FORBIDDEN', '需要管理员身份');

  const { bannerId } = event;
  if (typeof bannerId !== 'string' || !bannerId.trim()) return fail('INVALID_INPUT', '缺少 bannerId');

  try {
    const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
    const db = app.database();
    const found = await db.collection('banners').doc(bannerId).get();
    const doc = found && found.data && (Array.isArray(found.data) ? found.data[0] : found.data);
    if (!doc) return fail('NOT_FOUND', '合影不存在或已删除');
    const fileID = doc.fileID;
    await db.collection('banners').doc(bannerId).remove();
    if (fileID) {
      try { await app.deleteFile({ fileList: [fileID] }); } catch (_) { /* swallow: COS 清理失败不阻塞业务 */ }
    }
    return ok({ bannerId }, 'BANNER_REMOVED', '');
  } catch (e) {
    return fail('WRITE_ERROR', String((e && e.message) || e));
  }
};
