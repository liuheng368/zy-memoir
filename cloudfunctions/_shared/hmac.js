'use strict';

/**
 * cloudfunctions/_shared/hmac.js
 * HMAC-SHA256 防伪 token 编解码（无后端会话）。
 * 复制到 studentLogin / teacherLogin / adminCheck 内联使用，**不能 require**。
 *
 * Token 形态：`<expMs>.<base64url(payload)>.<hex(hmac)>`
 *
 * @example
 *   const token = signToken({ role: 'student', studentId: 12, name: '张三' }, secret, 30 * 24 * 3600 * 1000);
 *   const payload = verifyToken(token, secret); // → { role, studentId, name } 或 null
 */

const crypto = require('crypto');

function toBase64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(str) {
  const pad = 4 - (str.length % 4);
  const padded = pad === 4 ? str : str + '='.repeat(pad);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function signToken(payload, secret, ttlMs) {
  if (!secret) throw new Error('signToken: secret is required');
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('signToken: ttlMs must be positive');
  const exp = Date.now() + ttlMs;
  const body = toBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const data = exp + '.' + body;
  const hex = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return data + '.' + hex;
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
  } catch (_) {
    return null;
  }
  if (!safeEqual) return null;
  try {
    return JSON.parse(fromBase64Url(body).toString('utf8'));
  } catch (_) {
    return null;
  }
}

module.exports = { signToken, verifyToken };
