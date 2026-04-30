'use strict';

/**
 * cloudfunctions/teacherLogin/index.js
 *
 * 入参：{ teacherId: number }
 * 出参：
 *   成功 → { ok: true, code: 'LOGIN_OK', data: { profile: {teacherId, name, role}, token } }
 *   失败 → { ok: false, code: 'INVALID_INPUT' | 'TEACHER_NOT_FOUND' | 'SERVER_MISCONFIG', message }
 *
 * 仅按 id 校验（前端从 listTeachers 单选下拉，不允许自由输入）。
 * 与 plan v0.4 Q-PLAN-19 + Q-PLAN-18 对齐。
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
function ok(data, code = 'OK', message = '') { return { ok: true, code, message, data }; }
function fail(code, message = '') { return { ok: false, code, message }; }

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

exports.main = async (event = {}) => {
  const { teacherId } = event;
  if (typeof teacherId !== 'number' || !Number.isInteger(teacherId) || teacherId < 1 || teacherId > 100) {
    return fail('INVALID_INPUT', '请选择老师');
  }

  const secret = process.env.AUTH_HMAC_KEY;
  if (!secret) return fail('SERVER_MISCONFIG', 'AUTH_HMAC_KEY 未配置');

  const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
  const db = app.database();

  const { data } = await db.collection('teachers').where({ id: teacherId }).limit(1).get();
  if (!data.length) return fail('TEACHER_NOT_FOUND', '老师不存在');

  const teacher = data[0];
  const token = signToken(
    { role: 'teacher', teacherId: teacher.id, name: teacher.name },
    secret,
    TOKEN_TTL_MS
  );

  return ok(
    {
      profile: { teacherId: teacher.id, name: teacher.name, role: teacher.role },
      token
    },
    'LOGIN_OK',
    '登录成功'
  );
};
