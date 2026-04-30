'use strict';

/**
 * cloudfunctions/seedStudents/index.js
 *
 * Q-PLAN-20 / Q-DATA-4 = A：从 COS 真源拉名单 → 写入 students 集合（一次性）。
 * 入参：{ force?: boolean }   force=true 时清表重灌
 * 出参：{ ok, code: 'SEED_OK' | 'ALREADY_SEEDED' | 'EMPTY_LIST' | 'DOWNLOAD_FAIL', data: { count } }
 *
 * COS 真源 fileID（与 cloudbaserc.json envId 对应）：
 *   cloud://zy-memoir-d5gaxbvyxe80564f4.7a79-zy-memoir-d5gaxbvyxe80564f4-1306797866/2024_02_student_list.json
 *
 * Schema（写入 students 集合）：
 *   { id, name, gender, intro: '', photos: [], recordings: [], updatedAt }
 */

const tcb = require('@cloudbase/node-sdk');

const STUDENT_LIST_FILE_ID =
  'cloud://zy-memoir-d5gaxbvyxe80564f4.7a79-zy-memoir-d5gaxbvyxe80564f4-1306797866/2024_02_student_list.json';

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
  const col = db.collection('students');

  // 1. 拉名单
  let json;
  try {
    const downloadRes = await app.downloadFile({ fileID: STUDENT_LIST_FILE_ID });
    const content = downloadRes.fileContent;
    if (Buffer.isBuffer(content)) {
      json = JSON.parse(content.toString('utf8'));
    } else if (typeof content === 'string') {
      json = JSON.parse(content);
    } else {
      return fail('DOWNLOAD_FAIL', 'COS fileContent 非预期类型', typeof content);
    }
  } catch (e) {
    return fail('DOWNLOAD_FAIL', String((e && e.message) || e));
  }

  const list = (json && json.students) || [];
  if (!list.length) return fail('EMPTY_LIST', '名单为空');

  // 2. 检查是否已 seed
  const { total } = await col.count();
  if (total > 0 && !force) {
    return ok({ existing: total, count: 0 }, 'ALREADY_SEEDED', '集合已存在数据，未重灌（如需强制：传 force=true）');
  }

  // 3. force 时清表
  if (force && total > 0) {
    await col.where({ id: _.exists(true) }).remove();
  }

  // 4. 批量写入
  let count = 0;
  for (const s of list) {
    if (typeof s.id !== 'number' || typeof s.name !== 'string') continue;
    await col.add({
      id: s.id,
      name: s.name,
      gender: s.gender || 'unknown',
      intro: '',
      photos: [],
      recordings: [],
      updatedAt: db.serverDate()
    });
    count += 1;
  }

  return ok({ count, total: list.length }, 'SEED_OK', '名单种入完成');
};
