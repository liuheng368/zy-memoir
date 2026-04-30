'use strict';

/**
 * cloudfunctions/listStudents/index.js
 *
 * 主页学生头像墙（plan API-7）：返回 students 集合的精简字段。
 * 入参：无
 * 出参：{ ok: true, code: 'LIST_OK', data: { students: Array<{
 *          id, name, gender, avatar?, photoCount, recordingCount
 *        }> } }
 *
 * 公开只读接口，不需要 token；不返回 intro / photos / recordings 详情，
 * photoCount / recordingCount 在云函数侧从 photos.length / recordings.length 派生，
 * 以便前端无需感知 schema 是否进化（后续若 schema 直接落入 photoCount 也能平滑切换）。
 */

const tcb = require('@cloudbase/node-sdk');

function ok(data, code = 'OK', message = '') { return { ok: true, code, message, data }; }
function fail(code, message = '') { return { ok: false, code, message }; }

exports.main = async () => {
  try {
    const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
    const db = app.database();
    const { data } = await db.collection('students')
      .field({
        id: true,
        name: true,
        gender: true,
        avatar: true,
        photos: true,
        recordings: true,
        photoCount: true,
        recordingCount: true
      })
      .orderBy('id', 'asc')
      .limit(200)
      .get();
    const students = (data || []).map((s) => {
      const photoCount = typeof s.photoCount === 'number'
        ? s.photoCount
        : Array.isArray(s.photos) ? s.photos.length : 0;
      const recordingCount = typeof s.recordingCount === 'number'
        ? s.recordingCount
        : Array.isArray(s.recordings) ? s.recordings.length : 0;
      const out = {
        id: s.id,
        name: s.name,
        gender: s.gender || 'unknown',
        photoCount,
        recordingCount
      };
      if (s.avatar) out.avatar = s.avatar;
      return out;
    });
    return ok({ students }, 'LIST_OK', '');
  } catch (e) {
    return fail('LIST_ERROR', String((e && e.message) || e));
  }
};
