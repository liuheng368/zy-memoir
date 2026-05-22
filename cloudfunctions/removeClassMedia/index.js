'use strict'

/**
 * 班级素材墙删除。
 * - 学生 / 老师：只能删除自己上传的素材；
 * - 管理员：可以删除所有素材。
 */

const tcb = require('@cloudbase/node-sdk')
const crypto = require('crypto')

function fromBase64Url(str) {
  const pad = 4 - (str.length % 4)
  const padded = pad === 4 ? str : str + '='.repeat(pad)
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function verifyToken(token, secret) {
  if (typeof token !== 'string' || !secret) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [expStr, body, hex] = parts
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Date.now()) return null
  const data = expStr + '.' + body
  const expected = crypto.createHmac('sha256', secret).update(data).digest('hex')
  if (expected.length !== hex.length) return null
  try {
    if (!crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(hex, 'utf8'))) {
      return null
    }
  } catch (_) {
    return null
  }
  try {
    return JSON.parse(fromBase64Url(body).toString('utf8'))
  } catch (_) {
    return null
  }
}

function ok(data, code = 'OK', message = '') {
  return { ok: true, code, message, data }
}
function fail(code, message = '') {
  return { ok: false, code, message }
}

function resolvePayload(event) {
  const adminKey = process.env.ADMIN_HMAC_KEY
  const authKey = process.env.AUTH_HMAC_KEY
  if (!adminKey && !authKey) {
    return { error: fail('SERVER_MISCONFIG', 'ADMIN_HMAC_KEY / AUTH_HMAC_KEY 均未配置') }
  }

  if (adminKey) {
    const p = verifyToken(event.token, adminKey)
    if (p && p.role === 'admin') {
      return { payload: p, role: 'admin', ownerKey: 'admin' }
    }
  }

  if (authKey) {
    const p = verifyToken(event.token, authKey)
    if (p && p.role === 'student' && Number.isInteger(p.studentId)) {
      return { payload: p, role: 'student', ownerKey: 'student:' + p.studentId }
    }
    if (p && p.role === 'teacher' && Number.isInteger(p.teacherId)) {
      return { payload: p, role: 'teacher', ownerKey: 'teacher:' + p.teacherId }
    }
  }

  return { error: fail('UNAUTHORIZED', '登录态失效，请重新登录') }
}

exports.main = async (event = {}) => {
  const resolved = resolvePayload(event)
  if (resolved.error) return resolved.error

  const { mediaId } = event
  if (typeof mediaId !== 'string' || !mediaId.trim()) {
    return fail('INVALID_INPUT', '缺少 mediaId')
  }

  try {
    const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV })
    const db = app.database()
    const found = await db.collection('classMedia').doc(mediaId).get()
    const doc = found && found.data && (Array.isArray(found.data) ? found.data[0] : found.data)
    if (!doc) return fail('NOT_FOUND', '素材不存在或已删除')

    if (resolved.role !== 'admin' && doc.ownerKey !== resolved.ownerKey) {
      return fail('FORBIDDEN', '只能删除自己上传的内容')
    }

    await db.collection('classMedia').doc(mediaId).remove()
    if (doc.fileID) {
      try {
        await app.deleteFile({ fileList: [doc.fileID] })
      } catch (_) {
        // COS 清理失败不阻断删除记录，避免用户反复卡在同一条。
      }
    }

    return ok({ mediaId }, 'MEDIA_REMOVED', '')
  } catch (e) {
    return fail('WRITE_ERROR', String((e && e.message) || e))
  }
}
