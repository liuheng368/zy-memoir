'use strict';

/**
 * cloudfunctions/removeTeacherRecording/index.js
 *
 * plan API-17：删除老师录音（按 recordingId）；同步异步清理 COS（失败不阻塞）。
 * 入参：{ token, recordingId }
 * 出参：
 *   成功 → { ok: true, code: 'RECORDING_REMOVED', data: { recordingId, recordings } }
 *   失败 → { ok: false, code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'NOT_FOUND' | 'WRITE_ERROR' | 'SERVER_MISCONFIG' }
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
  const secret = process.env.AUTH_HMAC_KEY;
  if (!secret) return fail('SERVER_MISCONFIG', 'AUTH_HMAC_KEY 未配置');
  const payload = verifyToken(event.token, secret);
  if (!payload) return fail('UNAUTHORIZED', '登录态失效，请重新登录');
  if (payload.role !== 'teacher' && payload.role !== 'admin') {
    return fail('FORBIDDEN', '需要老师身份');
  }
  const { recordingId } = event;
  if (typeof recordingId !== 'string' || !recordingId) return fail('INVALID_INPUT', '缺少 recordingId');
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
    const cur = Array.isArray(doc.recordings) ? doc.recordings : [];
    const target = cur.find((r) => r && r.id === recordingId);
    if (!target) return fail('NOT_FOUND', '录音不存在或已删除');
    const next = cur.filter((r) => !r || r.id !== recordingId);
    await db.collection('teachers').doc(doc._id).update({
      recordings: next,
      updatedAt: Date.now()
    });
    if (target.fileID) {
      try { await app.deleteFile({ fileList: [target.fileID] }); } catch (_) { /* swallow */ }
    }
    return ok({ recordingId, recordings: next }, 'RECORDING_REMOVED', '');
  } catch (e) {
    return fail('WRITE_ERROR', String((e && e.message) || e));
  }
};
