'use strict'

/**
 * 班级素材墙列表：公开只读，返回所有登录用户上传的照片 / 语音。
 * collection: classMedia
 */

const tcb = require('@cloudbase/node-sdk')

function ok(data, code = 'OK', message = '') {
  return { ok: true, code, message, data }
}
function fail(code, message = '') {
  return { ok: false, code, message }
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

exports.main = async () => {
  try {
    const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV })
    const db = app.database()
    const { data } = await db.collection('classMedia').orderBy('createdAt', 'desc').limit(500).get()
    const list = Array.isArray(data) ? data : []
    if (!list.length) return ok({ items: [] }, 'LIST_OK', '')

    const fileIds = Array.from(new Set(list.map((it) => it.fileID).filter(Boolean)))
    const urlMap = new Map()
    for (const part of chunk(fileIds, 50)) {
      try {
        const r = await app.getTempFileURL({ fileList: part })
        for (const item of (r && r.fileList) || []) {
          if (item && item.fileID) urlMap.set(item.fileID, item.tempFileURL || item.url || '')
        }
      } catch (_) {
        // 单批 URL 刷新失败不阻断列表。
      }
    }

    const items = list.map((it) => {
      const fresh = urlMap.get(it.fileID)
      return {
        id: it._id,
        type: it.type === 'recording' ? 'recording' : 'photo',
        fileID: it.fileID,
        url: fresh || it.url || '',
        duration: typeof it.duration === 'number' ? it.duration : undefined,
        ownerRole: it.ownerRole || 'student',
        ownerKey: it.ownerKey || '',
        ownerName: it.ownerName || '',
        createdAt: typeof it.createdAt === 'number' ? it.createdAt : 0,
      }
    })

    return ok({ items }, 'LIST_OK', '')
  } catch (e) {
    return fail('LIST_ERROR', String((e && e.message) || e))
  }
}
