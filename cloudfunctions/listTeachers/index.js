'use strict';

/**
 * cloudfunctions/listTeachers/index.js
 *
 * 双用：
 *   1) /teacher 老师登录页下拉名单（仅需 id/name/role）
 *   2) 主页老师风采区（plan API-6）：增加 avatar / recordings 字段
 * 入参：无
 * 出参：{ ok: true, code: 'LIST_OK', data: { teachers: Array<{
 *          id, name, role, avatar?, recordings: Array<{url,duration,createdAt?}>
 *        }> } }
 *
 * 公开只读接口，不需要 token；只暴露非敏感字段（不返回 updatedAt 等）。
 */

const tcb = require('@cloudbase/node-sdk');

function ok(data, code = 'OK', message = '') { return { ok: true, code, message, data }; }
function fail(code, message = '') { return { ok: false, code, message }; }

exports.main = async () => {
  try {
    const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
    const db = app.database();
    const { data } = await db.collection('teachers')
      .field({ id: true, name: true, role: true, avatar: true, recordings: true })
      .orderBy('id', 'asc')
      .limit(100)
      .get();
    const teachers = (data || []).map((t) => {
      const out = {
        id: t.id,
        name: t.name,
        role: t.role,
        recordings: Array.isArray(t.recordings) ? t.recordings : []
      };
      if (t.avatar) out.avatar = t.avatar;
      return out;
    });
    return ok({ teachers }, 'LIST_OK', '');
  } catch (e) {
    return fail('LIST_ERROR', String((e && e.message) || e));
  }
};
