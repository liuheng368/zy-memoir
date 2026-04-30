'use strict';

/**
 * cloudfunctions/addStudentRecording/index.js
 *
 * plan API-13：新增学生录音（≤ 5 段、≤ 60 s、MP3）。
 * 入参：{ token, fileID, url?, duration }
 * 出参：
 *   成功 → { ok: true, code: 'RECORDING_OK', data: { recording, recordings } }
 *   失败 → { ok: false, code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'OVER_LIMIT' | 'OVER_DURATION' | 'STUDENT_NOT_FOUND' | 'WRITE_ERROR' | 'SERVER_MISCONFIG' }
 *
 * 兜底约束（PRD / plan）：
 * - recordings.length < 5
 * - duration <= 60
 * - 不在云函数侧探嗅 MIME（COS 已收文件，前端用 lamejs 编码 audio/mpeg）；客户端职责
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

const MAX_RECORDINGS = 5;
const MAX_DURATION = 60;

function uuid() { return crypto.randomBytes(8).toString('hex'); }

exports.main = async (event = {}) => {
  const secret = process.env.AUTH_HMAC_KEY;
  if (!secret) return fail('SERVER_MISCONFIG', 'AUTH_HMAC_KEY 未配置');
  const payload = verifyToken(event.token, secret);
  if (!payload) return fail('UNAUTHORIZED', '登录态失效，请重新登录');
  if (payload.role !== 'student' && payload.role !== 'admin') {
    return fail('FORBIDDEN', '需要学生身份');
  }
  const { fileID, duration } = event;
  if (typeof fileID !== 'string' || !fileID.trim()) return fail('INVALID_INPUT', '缺少 fileID');
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
    return fail('INVALID_INPUT', '缺少有效 duration（秒）');
  }
  if (duration > MAX_DURATION + 0.5) {
    return fail('OVER_DURATION', `单段录音最长 ${MAX_DURATION} 秒`);
  }
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
    const cur = Array.isArray(doc.recordings) ? doc.recordings : [];
    if (cur.length >= MAX_RECORDINGS) {
      return fail('OVER_LIMIT', `录音最多 ${MAX_RECORDINGS} 段，请先删除旧录音`);
    }
    const recording = {
      id: uuid(),
      fileID,
      url: typeof event.url === 'string' ? event.url : '',
      duration: Math.round(duration * 10) / 10,
      createdAt: Date.now()
    };
    await db.collection('students').doc(doc._id).update({
      recordings: _.push([recording]),
      updatedAt: Date.now()
    });
    return ok({ recording, recordings: cur.concat([recording]) }, 'RECORDING_OK', '');
  } catch (e) {
    return fail('WRITE_ERROR', String((e && e.message) || e));
  }
};
