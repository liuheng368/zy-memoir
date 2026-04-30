'use strict';

/**
 * cloudfunctions/_shared/response.js
 * 统一返回壳：{ ok, code, message, data?, detail? }
 * 复制到各业务函数内联使用，**不能 require**。
 */

function ok(data, code = 'OK', message = '') {
  return { ok: true, code, message, data };
}

function fail(code, message = '', extra = undefined) {
  const r = { ok: false, code, message };
  if (extra !== undefined) r.detail = extra;
  return r;
}

module.exports = { ok, fail };
