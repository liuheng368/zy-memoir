'use strict';

/**
 * cloudfunctions/addStudentPhoto/index.js
 *
 * plan API-11：新增学生照片（≤ 3 张约束）。
 * 入参：{ token, fileID, url? }
 *   - 前端先 useImageCompress + useUpload 拿到 fileID + 临时 url（可选）后再调本函数；
 *   - 云函数侧不再做体积校验（COS 已收文件），仅做条数与角色兜底。
 * 出参：
 *   成功 → { ok: true, code: 'PHOTO_OK', data: { photo: {...}, photos } }
 *   失败 → { ok: false, code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'OVER_LIMIT' | 'STUDENT_NOT_FOUND' | 'WRITE_ERROR' | 'SERVER_MISCONFIG' }
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

const MAX_PHOTOS = 3;

function uuid() {
  return crypto.randomBytes(8).toString('hex');
}

exports.main = async (event = {}) => {
  const secret = process.env.AUTH_HMAC_KEY;
  if (!secret) return fail('SERVER_MISCONFIG', 'AUTH_HMAC_KEY 未配置');
  const payload = verifyToken(event.token, secret);
  if (!payload) return fail('UNAUTHORIZED', '登录态失效，请重新登录');
  if (payload.role !== 'student' && payload.role !== 'admin') {
    return fail('FORBIDDEN', '需要学生身份');
  }

  const { fileID } = event;
  if (typeof fileID !== 'string' || !fileID.trim()) return fail('INVALID_INPUT', '缺少 fileID');
  const studentId = payload.role === 'admin' && Number.isInteger(event.studentId)
    ? event.studentId
    : payload.studentId;
  if (!Number.isInteger(studentId)) return fail('INVALID_INPUT', '缺少 studentId');

  try {
    const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
    const db = app.database();
    const _ = db.command;
    const found = await db.collection('students').where({ id: studentId }).limit(1).get();
    if (!found.data || !found.data.length) return fail('STUDENT_NOT_FOUND', '学生不存在');
    const doc = found.data[0];
    const cur = Array.isArray(doc.photos) ? doc.photos : [];
    if (cur.length >= MAX_PHOTOS) {
      return fail('OVER_LIMIT', `照片最多 ${MAX_PHOTOS} 张，请先删除旧照片`);
    }
    const photo = {
      id: uuid(),
      fileID,
      url: typeof event.url === 'string' ? event.url : '',
      createdAt: Date.now()
    };
    await db.collection('students').doc(doc._id).update({
      photos: _.push([photo]),
      updatedAt: Date.now()
    });
    return ok({ photo, photos: cur.concat([photo]) }, 'PHOTO_OK', '');
  } catch (e) {
    return fail('WRITE_ERROR', String((e && e.message) || e));
  }
};
