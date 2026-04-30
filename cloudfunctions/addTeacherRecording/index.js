'use strict';

/**
 * cloudfunctions/addTeacherRecording/index.js
 *
 * plan API-16：新增老师录音（PRD/Q-PLAN-12 不限段数；单段 ≤ 60 s；MP3）。
 * 入参：{ token, fileID, url?, duration }
 * 出参：
 *   成功 → { ok: true, code: 'RECORDING_OK', data: { recording, recordings } }
 *   失败 → { ok: false, code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'OVER_DURATION' | 'NOT_FOUND' | 'WRITE_ERROR' | 'SERVER_MISCONFIG' }
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

const MAX_DURATION = 60;
function uuid() { return crypto.randomBytes(8).toString('hex'); }

exports.main = async (event = {}) => {
  const secret = process.env.AUTH_HMAC_KEY;
  if (!secret) return fail('SERVER_MISCONFIG', 'AUTH_HMAC_KEY 未配置');
  const payload = verifyToken(event.token, secret);
  if (!payload) return fail('UNAUTHORIZED', '登录态失效，请重新登录');
  if (payload.role !== 'teacher' && payload.role !== 'admin') {
    return fail('FORBIDDEN', '需要老师身份');
  }
  const { fileID, duration } = event;
  if (typeof fileID !== 'string' || !fileID.trim()) return fail('INVALID_INPUT', '缺少 fileID');
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
    return fail('INVALID_INPUT', '缺少有效 duration（秒）');
  }
  if (duration > MAX_DURATION + 0.5) {
    return fail('OVER_DURATION', `单段录音最长 ${MAX_DURATION} 秒`);
  }
  const teacherId = payload.role === 'admin' && Number.isInteger(event.teacherId)
    ? event.teacherId
    : payload.teacherId;
  if (!Number.isInteger(teacherId)) return fail('INVALID_INPUT', '缺少 teacherId');

  try {
    const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
    const db = app.database();
    const _ = db.command;
    const found = await db.collection('teachers').where({ id: teacherId }).limit(1).get();
    if (!found.data || !found.data.length) return fail('NOT_FOUND', '老师不存在');
    const doc = found.data[0];
    const cur = Array.isArray(doc.recordings) ? doc.recordings : [];
    const recording = {
      id: uuid(),
      fileID,
      url: typeof event.url === 'string' ? event.url : '',
      duration: Math.round(duration * 10) / 10,
      createdAt: Date.now()
    };
    await db.collection('teachers').doc(doc._id).update({
      recordings: _.push([recording]),
      updatedAt: Date.now()
    });
    return ok({ recording, recordings: cur.concat([recording]) }, 'RECORDING_OK', '');
  } catch (e) {
    return fail('WRITE_ERROR', String((e && e.message) || e));
  }
};
