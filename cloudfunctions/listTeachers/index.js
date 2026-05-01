'use strict';

/**
 * cloudfunctions/listTeachers/index.js
 *
 * 双用：
 *   1) /teacher 老师登录页下拉名单（仅需 id/name/role）
 *   2) 主页老师风采区（plan API-6）：增加 avatar / recordings 字段
 * 入参：无
 * 出参：{ ok: true, code: 'LIST_OK', data: { teachers: Array<{
 *          id, name, role, avatar?, recordings: Array<{id,fileID,url,duration,createdAt?}>
 *        }> } }
 *
 * 公开只读接口，不需要 token；只暴露非敏感字段（不返回 updatedAt 等）。
 *
 * URL 现场刷新（修 BUG-AVATAR-EXPIRE）：
 *   db 中固化的 avatar.url / recording.url 是上传时拿到的临时签名 URL（默认 2 h 过期）。
 *   这里仿 listBanners 在返回前用 fileID 调 getTempFileURL 重新签发；
 *   单条失败 → 用 db 里的旧 url 兜底。
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
    const { data } = await db.collection('teachers')
      .field({ id: true, name: true, role: true, avatar: true, recordings: true })
      .orderBy('id', 'asc')
      .limit(100)
      .get();
    const list = Array.isArray(data) ? data : [];

    // 汇总所有需要刷新的 fileID（avatar + recordings[]）
    const fileIds = [];
    for (const t of list) {
      if (t && t.avatar && t.avatar.fileID) fileIds.push(t.avatar.fileID);
      if (Array.isArray(t.recordings)) {
        for (const r of t.recordings) if (r && r.fileID) fileIds.push(r.fileID);
      }
    }
    const urlMap = await refreshUrls(app, fileIds);

    const teachers = list.map((t) => {
      const recordings = Array.isArray(t.recordings) ? t.recordings.map((r) => {
        if (!r) return r;
        const fresh = r.fileID ? urlMap.get(r.fileID) : '';
        return { ...r, url: fresh || r.url || '' };
      }) : [];
      const out = {
        id: t.id,
        name: t.name,
        role: t.role,
        recordings
      };
      if (t.avatar && t.avatar.fileID) {
        const fresh = urlMap.get(t.avatar.fileID);
        out.avatar = { fileID: t.avatar.fileID, url: fresh || t.avatar.url || '' };
      } else if (t.avatar) {
        out.avatar = t.avatar;
      }
      return out;
    });
    return ok({ teachers }, 'LIST_OK', '');
  } catch (e) {
    return fail('LIST_ERROR', String((e && e.message) || e));
  }
};
