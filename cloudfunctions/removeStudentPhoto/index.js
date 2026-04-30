'use strict';

/**
 * cloudfunctions/removeStudentPhoto/index.js
 *
 * plan API-12：删除学生照片（按 photoId）；同步异步清理 COS 文件（失败不阻塞业务）。
 * 入参：{ token, photoId }
 * 出参：
 *   成功 → { ok: true, code: 'PHOTO_REMOVED', data: { photoId, photos } }
 *   失败 → { ok: false, code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'NOT_FOUND' | 'WRITE_ERROR' | 'SERVER_MISCONFIG' }
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
  if (payload.role !== 'student' && payload.role !== 'admin') {
    return fail('FORBIDDEN', '需要学生身份');
  }
  const { photoId } = event;
  if (typeof photoId !== 'string' || !photoId) return fail('INVALID_INPUT', '缺少 photoId');
  const studentId = payload.role === 'admin' && Number.isInteger(event.studentId)
    ? event.studentId
    : payload.studentId;
  if (!Number.isInteger(studentId)) return fail('INVALID_INPUT', '缺少 studentId');

  try {
    const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
    const db = app.database();
    const found = await db.collection('students').where({ id: studentId }).limit(1).get();
    if (!found.data || !found.data.length) return fail('NOT_FOUND', '学生不存在');
    const doc = found.data[0];
    const cur = Array.isArray(doc.photos) ? doc.photos : [];
    const target = cur.find((p) => p && p.id === photoId);
    if (!target) return fail('NOT_FOUND', '照片不存在或已删除');
    const next = cur.filter((p) => !p || p.id !== photoId);
    await db.collection('students').doc(doc._id).update({
      photos: next,
      updatedAt: Date.now()
    });
    if (target.fileID) {
      try { await app.deleteFile({ fileList: [target.fileID] }); } catch (_) { /* swallow: COS 清理失败不阻塞业务 */ }
    }
    return ok({ photoId, photos: next }, 'PHOTO_REMOVED', '');
  } catch (e) {
    return fail('WRITE_ERROR', String((e && e.message) || e));
  }
};
