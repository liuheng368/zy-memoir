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
 *
 * URL 现场刷新（修 BUG-AVATAR-EXPIRE）：
 *   db 中固化的 avatar.url 是上传时拿到的临时签名 URL（默认 2 h 过期），透传给前端会出现
 *   broken image。这里仿 listBanners 在返回前用 fileID 调 getTempFileURL 重新签发；
 *   单条失败 → 用 db 里的旧 url 兜底（业务侧再叠加默认头像兜底）。
 */

const tcb = require('@cloudbase/node-sdk');

function ok(data, code = 'OK', message = '') { return { ok: true, code, message, data }; }
function fail(code, message = '') { return { ok: false, code, message }; }

/** 批量调 getTempFileURL（单次最多 50 个 fileID）；失败时返回空 Map 不阻塞业务。 */
async function refreshUrls(app, fileIds) {
  const map = new Map();
  if (!Array.isArray(fileIds) || !fileIds.length) return map;
  const uniq = Array.from(new Set(fileIds.filter((id) => typeof id === 'string' && id)));
  const CHUNK = 50;
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const slice = uniq.slice(i, i + CHUNK);
    try {
      const r = await app.getTempFileURL({ fileList: slice });
      for (const item of (r && r.fileList) || []) {
        if (item && item.fileID) map.set(item.fileID, item.tempFileURL || item.url || '');
      }
    } catch (_) { /* swallow */ }
  }
  return map;
}

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
    const list = Array.isArray(data) ? data : [];

    // 收集所有 avatar.fileID 批量刷新临时 URL
    const fileIds = list
      .map((s) => s && s.avatar && s.avatar.fileID)
      .filter(Boolean);
    const urlMap = await refreshUrls(app, fileIds);

    const students = list.map((s) => {
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
      if (s.avatar && s.avatar.fileID) {
        const fresh = urlMap.get(s.avatar.fileID);
        out.avatar = { fileID: s.avatar.fileID, url: fresh || s.avatar.url || '' };
      } else if (s.avatar) {
        out.avatar = s.avatar;
      }
      return out;
    });
    return ok({ students }, 'LIST_OK', '');
  } catch (e) {
    return fail('LIST_ERROR', String((e && e.message) || e));
  }
};
