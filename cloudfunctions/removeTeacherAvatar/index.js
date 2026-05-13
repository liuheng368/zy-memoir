'use strict';

/**
 * cloudfunctions/removeTeacherAvatar/index.js
 *
 * 老师删除头像（仅本人或 admin）。
 * 入参：{ token, teacherId? }
 * 出参：
 *   成功 → { ok: true, code: 'AVATAR_REMOVED', data: { avatar: null } }
 *   失败 → { ok: false, code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'NOT_FOUND' | 'WRITE_ERROR' | 'SERVER_MISCONFIG' }
 *
 * 删除旧头像 COS 文件（若存在 fileID）：try/catch 静默吞，不阻塞业务。
 */

const tcb = require('@cloudbase/node-sdk');
const crypto = require('crypto');

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
  const secret = process.env.AUTH_HMAC_KEY;
  if (!secret) return fail('SERVER_MISCONFIG', 'AUTH_HMAC_KEY 未配置');
  const payload = verifyToken(event.token, secret);
  if (!payload) return fail('UNAUTHORIZED', '登录态失效，请重新登录');
  if (payload.role !== 'teacher' && payload.role !== 'admin') {
    return fail('FORBIDDEN', '需要老师身份');
  }
  const teacherId = payload.role === 'admin' && Number.isInteger(event.teacherId)
    ? event.teacherId
    : payload.teacherId;
  if (!Number.isInteger(teacherId)) return fail('INVALID_INPUT', '缺少 teacherId');

  try {
    const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
    const db = app.database();
    const found = await db.collection('teachers').where({ id: teacherId }).limit(1).get();
    if (!found.data || !found.data.length) return fail('NOT_FOUND', '老师不存在');
    const doc = found.data[0];
    const oldFileID = doc && doc.avatar && doc.avatar.fileID;
    await db.collection('teachers').doc(doc._id).update({
      avatar: null,
      updatedAt: Date.now()
    });
    if (oldFileID) {
      try { await app.deleteFile({ fileList: [oldFileID] }); } catch (_) { /* swallow */ }
    }
    return ok({ avatar: null }, 'AVATAR_REMOVED', '');
  } catch (e) {
    return fail('WRITE_ERROR', String((e && e.message) || e));
  }
};
