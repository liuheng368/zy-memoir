'use strict';

/**
 * cloudfunctions/studentLogin/index.js
 *
 * 入参：{ studentId: number, name: string }
 * 出参：
 *   成功 → { ok: true, code: 'LOGIN_OK', data: { profile: {studentId, name, gender}, token } }
 *   失败 → { ok: false, code: 'INVALID_INPUT' | 'STUDENT_NOT_FOUND' | 'NAME_MISMATCH' | 'SERVER_MISCONFIG', message }
 *
 * 校验：CloudBase DB students 集合查 id → 比对 name（trim）→ HMAC 签 30 天会话 token。
 * 与 plan v0.4 Q-PLAN-19（云函数主校验）+ Q-PLAN-18（HMAC token）对齐。
 */

const tcb = require('@cloudbase/node-sdk');
const crypto = require('crypto');

// SYNCED FROM cloudfunctions/_shared/hmac.js
function toBase64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function signToken(payload, secret, ttlMs) {
  if (!secret) throw new Error('signToken: secret is required');
  const exp = Date.now() + ttlMs;
  const body = toBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const data = exp + '.' + body;
  const hex = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return data + '.' + hex;
}
// SYNCED FROM cloudfunctions/_shared/response.js
function ok(data, code = 'OK', message = '') { return { ok: true, code, message, data }; }
function fail(code, message = '') { return { ok: false, code, message }; }

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

exports.main = async (event = {}) => {
  const { studentId, name } = event;
  if (typeof studentId !== 'number' || !Number.isInteger(studentId) || studentId < 1 || studentId > 200) {
    return fail('INVALID_INPUT', '请输入有效学号');
  }
  if (typeof name !== 'string' || !name.trim()) {
    return fail('INVALID_INPUT', '请输入姓名');
  }

  const secret = process.env.AUTH_HMAC_KEY;
  if (!secret) return fail('SERVER_MISCONFIG', 'AUTH_HMAC_KEY 未配置');

  const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
  const db = app.database();

  const { data } = await db.collection('students').where({ id: studentId }).limit(1).get();
  if (!data.length) return fail('STUDENT_NOT_FOUND', '学号不存在，请联系老师确认');

  const student = data[0];
  if (String(student.name).trim() !== String(name).trim()) {
    return fail('NAME_MISMATCH', '学号与姓名不一致');
  }

  const token = signToken(
    { role: 'student', studentId: student.id, name: student.name },
    secret,
    TOKEN_TTL_MS
  );

  return ok(
    {
      profile: { studentId: student.id, name: student.name, gender: student.gender },
      token
    },
    'LOGIN_OK',
    '登录成功'
  );
};
