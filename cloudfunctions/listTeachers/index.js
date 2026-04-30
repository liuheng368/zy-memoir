'use strict';

/**
 * cloudfunctions/listTeachers/index.js
 *
 * 进入 /teacher 时供老师下拉名单使用：返回 teachers 集合的精简字段。
 * 入参：无
 * 出参：{ ok: true, code: 'LIST_OK', data: { teachers: Array<{id, name, role}> } }
 *
 * 公开只读接口，不需要 token；不返回敏感字段（不返回 recordings / updatedAt）。
 */

const tcb = require('@cloudbase/node-sdk');

function ok(data, code = 'OK', message = '') { return { ok: true, code, message, data }; }
function fail(code, message = '') { return { ok: false, code, message }; }

exports.main = async () => {
  try {
    const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
    const db = app.database();
    const { data } = await db.collection('teachers')
      .field({ id: true, name: true, role: true })
      .orderBy('id', 'asc')
      .limit(100)
      .get();
    const teachers = (data || []).map((t) => ({ id: t.id, name: t.name, role: t.role }));
    return ok({ teachers }, 'LIST_OK', '');
  } catch (e) {
    return fail('LIST_ERROR', String((e && e.message) || e));
  }
};
