'use strict'

/**
 * 班级素材墙上传登记：学生 / 老师 / 管理员均可上传照片或语音。
 * 每个身份限制 99 张照片、99 条语音。
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
    if (!crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(hex, 'utf8')))
      return null
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

const MAX_EACH_TYPE = 99
const MAX_DURATION = 60

function resolvePayload(event) {
  const adminKey = process.env.ADMIN_HMAC_KEY
  const authKey = process.env.AUTH_HMAC_KEY
  if (!adminKey && !authKey) {
    return { error: fail('SERVER_MISCONFIG', 'ADMIN_HMAC_KEY / AUTH_HMAC_KEY 均未配置') }
  }

  if (adminKey) {
    const p = verifyToken(event.token, adminKey)
    if (p && p.role === 'admin') {
      return { payload: p, ownerRole: 'admin', ownerKey: 'admin', ownerName: '管理员' }
    }
  }

  if (authKey) {
    const p = verifyToken(event.token, authKey)
    if (p && p.role === 'student' && Number.isInteger(p.studentId)) {
      return {
        payload: p,
        ownerRole: 'student',
        ownerKey: 'student:' + p.studentId,
        ownerName: p.name || '学生 ' + p.studentId,
      }
    }
    if (p && p.role === 'teacher' && Number.isInteger(p.teacherId)) {
      return {
        payload: p,
        ownerRole: 'teacher',
        ownerKey: 'teacher:' + p.teacherId,
        ownerName: p.name || '老师 ' + p.teacherId,
      }
    }
  }

  return { error: fail('UNAUTHORIZED', '登录态失效，请重新登录') }
}

async function countBy(db, ownerKey, type) {
  const r = await db.collection('classMedia').where({ ownerKey, type }).count()
  return typeof r.total === 'number' ? r.total : 0
}

exports.main = async (event = {}) => {
  const resolved = resolvePayload(event)
  if (resolved.error) return resolved.error

  const type = event.type === 'recording' ? 'recording' : event.type === 'photo' ? 'photo' : ''
  if (!type) return fail('INVALID_INPUT', 'type 必须是 photo 或 recording')
  if (typeof event.fileID !== 'string' || !event.fileID.trim())
    return fail('INVALID_INPUT', '缺少 fileID')

  let duration = undefined
  if (type === 'recording') {
    duration = Number(event.duration)
    if (!Number.isFinite(duration) || duration <= 0)
      return fail('INVALID_INPUT', '缺少有效 duration（秒）')
    if (duration > MAX_DURATION + 0.5)
      return fail('OVER_DURATION', `单段录音最长 ${MAX_DURATION} 秒`)
    duration = Math.round(duration * 10) / 10
  }

  try {
    const app = tcb.init({ env: tcb.SYMBOL_CURRENT_ENV })
    const db = app.database()
    const current = await countBy(db, resolved.ownerKey, type)
    if (current >= MAX_EACH_TYPE) {
      return fail('OVER_LIMIT', `${type === 'photo' ? '图片' : '语音'}最多 ${MAX_EACH_TYPE} 条`)
    }

    const now = Date.now()
    const doc = {
      type,
      fileID: event.fileID,
      url: typeof event.url === 'string' ? event.url : '',
      ownerRole: resolved.ownerRole,
      ownerKey: resolved.ownerKey,
      ownerName: resolved.ownerName,
      createdAt: now,
      updatedAt: now,
    }
    if (type === 'recording') doc.duration = duration
    const r = await db.collection('classMedia').add(doc)
    const id = r && (r.id || r._id)
    const photoCount =
      type === 'photo' ? current + 1 : await countBy(db, resolved.ownerKey, 'photo')
    const recordingCount =
      type === 'recording' ? current + 1 : await countBy(db, resolved.ownerKey, 'recording')

    return ok(
      {
        item: { id, ...doc },
        counts: { photos: photoCount, recordings: recordingCount },
      },
      'MEDIA_OK',
      '',
    )
  } catch (e) {
    return fail('WRITE_ERROR', String((e && e.message) || e))
  }
}
