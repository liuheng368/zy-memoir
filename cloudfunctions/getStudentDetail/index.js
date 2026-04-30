'use strict';

/**
 * cloudfunctions/getStudentDetail/index.js
 *
 * plan API-8：拉取学生浮层所需的完整详情（intro / avatar / photos / recordings）。
 * 公开只读：游客 / 客态都能看（spec AC-7 / AC-17）；编辑能力由前端 mode + 写入云函数侧二次拒绝兜底。
 *
 * 入参：{ studentId: number }
 * 出参：
 *   成功 → { ok: true, code: 'DETAIL_OK', data: { student: {...} } }
 *   失败 → { ok: false, code: 'INVALID_INPUT' | 'STUDENT_NOT_FOUND' | 'FETCH_ERROR' }
 */

const tcb = require('@cloudbase/node-sdk');

function ok(data, code = 'OK', message = '') { return { ok: true, code, message, data }; }
function fail(code, message = '') { return { ok: false, code, message }; }

exports.main = async (event = {}) => {
  const { studentId } = event;
  if (typeof studentId !== 'number' || !Number.isInteger(studentId) || studentId < 1 || studentId > 200) {
    return fail('INVALID_INPUT', '请传入有效 studentId');
  }
  try {
    const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
    const db = app.database();
    const { data } = await db.collection('students')
      .where({ id: studentId })
      .field({
        id: true,
        name: true,
        gender: true,
        intro: true,
        avatar: true,
        photos: true,
        recordings: true,
        updatedAt: true
      })
      .limit(1)
      .get();
    if (!data || !data.length) return fail('STUDENT_NOT_FOUND', '学生不存在');
    const s = data[0];
    return ok({
      student: {
        id: s.id,
        name: s.name,
        gender: s.gender || 'unknown',
        intro: typeof s.intro === 'string' ? s.intro : '',
        avatar: s.avatar || null,
        photos: Array.isArray(s.photos) ? s.photos : [],
        recordings: Array.isArray(s.recordings) ? s.recordings : [],
        updatedAt: s.updatedAt || null
      }
    }, 'DETAIL_OK', '');
  } catch (e) {
    return fail('FETCH_ERROR', String((e && e.message) || e));
  }
};
