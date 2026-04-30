'use strict';

/**
 * cloudfunctions/listBanners/index.js
 *
 * plan API-5：主页合影轮播。公开只读接口（不需要 token）。
 * 入参：无
 * 出参：{ ok: true, code: 'LIST_OK', data: { banners: Array<{
 *          id, fileID, url, createdAt, uploadedBy?, caption?
 *        }> } }
 *
 * 行为：
 *   - `db.collection('banners').orderBy('createdAt', 'desc').get()`
 *   - 对每条记录用 `getTempFileURL` 现场签发 ~2 h 临时 URL（COS 直链 24 h，
 *     这里固定每次都重签，避免链接缓存导致的 403）
 *   - 任何单条 URL 解析失败 → 用 doc.url 兜底（可能是 fileID 字面量），不阻塞列表
 */

const tcb = require('@cloudbase/node-sdk');

function ok(data, code = 'OK', message = '') { return { ok: true, code, message, data }; }
function fail(code, message = '') { return { ok: false, code, message }; }

exports.main = async () => {
  try {
    const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV });
    const db = app.database();
    const { data } = await db.collection('banners')
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();
    const list = Array.isArray(data) ? data : [];
    if (!list.length) return ok({ banners: [] }, 'LIST_OK', '');

    // 批量 getTempFileURL（一次最多 50 个；这里数量小，单次足够）
    const fileIds = list.map((b) => b.fileID).filter(Boolean);
    let urlMap = new Map();
    if (fileIds.length) {
      try {
        const r = await app.getTempFileURL({ fileList: fileIds });
        for (const item of (r && r.fileList) || []) {
          if (item && item.fileID) urlMap.set(item.fileID, item.tempFileURL || item.url || '');
        }
      } catch (_) {
        // swallow：URL 刷新失败不阻塞列表，前端用 doc.url 兜底
      }
    }

    const banners = list.map((b) => {
      const fresh = urlMap.get(b.fileID);
      return {
        id: b._id,
        fileID: b.fileID,
        url: fresh || b.url || '',
        createdAt: typeof b.createdAt === 'number' ? b.createdAt : 0,
        uploadedBy: b.uploadedBy || 'admin',
        caption: typeof b.caption === 'string' ? b.caption : ''
      };
    });

    return ok({ banners }, 'LIST_OK', '');
  } catch (e) {
    return fail('LIST_ERROR', String((e && e.message) || e));
  }
};
