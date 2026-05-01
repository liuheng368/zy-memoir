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
 *
 * URL 现场刷新（修 BUG-AVATAR-EXPIRE）：
 *   db 中固化的 avatar.url / photos[].url / recordings[].url 是上传时拿到的临时签名 URL
 *   （默认 2 h 过期）。这里仿 listBanners 在返回前用 fileID 调 getTempFileURL 重新签发；
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

    // 汇总所有需要刷新的 fileID（avatar + photos[] + recordings[]）
    const fileIds = [];
    if (s.avatar && s.avatar.fileID) fileIds.push(s.avatar.fileID);
    if (Array.isArray(s.photos)) {
      for (const p of s.photos) if (p && p.fileID) fileIds.push(p.fileID);
    }
    if (Array.isArray(s.recordings)) {
      for (const r of s.recordings) if (r && r.fileID) fileIds.push(r.fileID);
    }
    const urlMap = await refreshUrls(app, fileIds);

    const avatar = (s.avatar && s.avatar.fileID)
      ? { fileID: s.avatar.fileID, url: urlMap.get(s.avatar.fileID) || s.avatar.url || '' }
      : (s.avatar || null);
    const photos = Array.isArray(s.photos) ? s.photos.map((p) => {
      if (!p) return p;
      const fresh = p.fileID ? urlMap.get(p.fileID) : '';
      return { ...p, url: fresh || p.url || '' };
    }) : [];
    const recordings = Array.isArray(s.recordings) ? s.recordings.map((r) => {
      if (!r) return r;
      const fresh = r.fileID ? urlMap.get(r.fileID) : '';
      return { ...r, url: fresh || r.url || '' };
    }) : [];

    return ok({
      student: {
        id: s.id,
        name: s.name,
        gender: s.gender || 'unknown',
        intro: typeof s.intro === 'string' ? s.intro : '',
        avatar,
        photos,
        recordings,
        updatedAt: s.updatedAt || null
      }
    }, 'DETAIL_OK', '');
  } catch (e) {
    return fail('FETCH_ERROR', String((e && e.message) || e));
  }
};
