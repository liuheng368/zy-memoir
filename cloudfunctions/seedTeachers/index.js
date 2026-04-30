'use strict';

/**
 * cloudfunctions/seedTeachers/index.js
 *
 * Q-PLAN-20：从 COS 真源拉老师名单 → 写入 teachers 集合（一次性）。
 * 入参：{ force?: boolean }
 * 出参：{ ok, code: 'SEED_OK' | 'ALREADY_SEEDED' | 'EMPTY_LIST' | 'DOWNLOAD_FAIL', data: { count } }
 *
 * COS 真源：
 *   cloud://zy-memoir-d5gaxbvyxe80564f4.7a79-zy-memoir-d5gaxbvyxe80564f4-1306797866/2024_02_teacher_list.json
 *
 * Schema（写入 teachers 集合）：
 *   { id, name, role: 'lead'|'assistant'|'life', recordings: [], updatedAt }
 */

const tcb = require('@cloudbase/node-sdk');

const TEACHER_LIST_FILE_ID =
  'cloud://zy-memoir-d5gaxbvyxe80564f4.7a79-zy-memoir-d5gaxbvyxe80564f4-1306797866/2024_02_teacher_list.json';

function ok(data, code = 'OK', message = '') { return { ok: true, code, message, data }; }
function fail(code, message = '', detail = undefined) {
  const r = { ok: false, code, message };
  if (detail !== undefined) r.detail = detail;
  return r;
}

exports.main = async (event = {}) => {
  const force = !!event.force;
  const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
  const db = app.database();
  const _ = db.command;
  const col = db.collection('teachers');

  let json;
  try {
    const downloadRes = await app.downloadFile({ fileID: TEACHER_LIST_FILE_ID });
    const content = downloadRes.fileContent;
    if (Buffer.isBuffer(content)) json = JSON.parse(content.toString('utf8'));
    else if (typeof content === 'string') json = JSON.parse(content);
    else return fail('DOWNLOAD_FAIL', 'COS fileContent 非预期类型', typeof content);
  } catch (e) {
    return fail('DOWNLOAD_FAIL', String((e && e.message) || e));
  }

  const list = (json && json.teachers) || [];
  if (!list.length) return fail('EMPTY_LIST', '名单为空');

  const { total } = await col.count();
  if (total > 0 && !force) {
    return ok({ existing: total, count: 0 }, 'ALREADY_SEEDED', '集合已存在数据，未重灌（如需强制：传 force=true）');
  }
  if (force && total > 0) {
    await col.where({ id: _.exists(true) }).remove();
  }

  let count = 0;
  for (const t of list) {
    if (typeof t.id !== 'number' || typeof t.name !== 'string') continue;
    await col.add({
      id: t.id,
      name: t.name,
      role: t.role || 'lead',
      recordings: [],
      updatedAt: db.serverDate()
    });
    count += 1;
  }

  return ok({ count, total: list.length }, 'SEED_OK', '老师名单种入完成');
};
