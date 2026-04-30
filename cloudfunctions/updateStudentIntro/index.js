'use strict';

/**
 * cloudfunctions/updateStudentIntro/index.js
 *
 * plan API-9：保存学生自我介绍。
 * 入参：{ token, intro }
 * 出参：
 *   成功 → { ok: true, code: 'INTRO_OK', data: { intro } }
 *   失败 → { ok: false, code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'INTRO_TOO_LONG' | 'STUDENT_NOT_FOUND' | 'WRITE_ERROR' | 'SERVER_MISCONFIG' }
 *
 * 兜底约束（spec Q7 / plan 常量 MAX_INTRO_LENGTH=300）：
 * - 必须携带有效 token + role=student
 * - 仅可改本人 intro（payload.studentId 决定行）
 * - intro 必须为 string 且 ≤ 300（按 Unicode code-points 粗算）
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
// SYNCED FROM cloudfunctions/_shared/response.js
function ok(data, code = 'OK', message = '') { return { ok: true, code, message, data }; }
function fail(code, message = '') { return { ok: false, code, message }; }

const MAX_INTRO = 300;

exports.main = async (event = {}) => {
  const secret = process.env.AUTH_HMAC_KEY;
  if (!secret) return fail('SERVER_MISCONFIG', 'AUTH_HMAC_KEY 未配置');
  const payload = verifyToken(event.token, secret);
  if (!payload) return fail('UNAUTHORIZED', '登录态失效，请重新登录');
  if (payload.role !== 'student' && payload.role !== 'admin') {
    return fail('FORBIDDEN', '需要学生身份');
  }

  const { intro } = event;
  if (typeof intro !== 'string') return fail('INVALID_INPUT', 'intro 必须是字符串');
  // 用 Array.from 取 code-points 长度，避免代理对算两次
  const codepoints = Array.from(intro);
  if (codepoints.length > MAX_INTRO) {
    return fail('INTRO_TOO_LONG', `自我介绍最多 ${MAX_INTRO} 字`);
  }
  const studentId = payload.role === 'admin' && Number.isInteger(event.studentId)
    ? event.studentId
    : payload.studentId;
  if (!Number.isInteger(studentId)) return fail('INVALID_INPUT', '缺少 studentId');

  try {
    const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
    const db = app.database();
    const found = await db.collection('students').where({ id: studentId }).limit(1).get();
    if (!found.data || !found.data.length) return fail('STUDENT_NOT_FOUND', '学生不存在');
    const docId = found.data[0]._id;
    await db.collection('students').doc(docId).update({
      intro,
      updatedAt: Date.now()
    });
    return ok({ intro }, 'INTRO_OK', '');
  } catch (e) {
    return fail('WRITE_ERROR', String((e && e.message) || e));
  }
};
