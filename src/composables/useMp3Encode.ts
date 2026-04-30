/**
 * src/composables/useMp3Encode.ts — `@breezystack/lamejs` 浏览器内 MP3 编码
 *
 * 流程：原始录音 Blob → AudioContext.decodeAudioData → Float32 PCM → Int16 PCM
 *       → lamejs.Mp3Encoder.encodeBuffer/flush → audio/mpeg Blob
 *
 * 选型 / 上下文：
 * - PRD 强制保存格式 = MP3（plan Q-PLAN-5 = 客户端 lamejs，无云端转码）
 * - 默认单声道 + 128 kbps；60 s 录音约 ≤ 1 MB（与 plan §概述容量预测一致）
 *
 * Plan: G8 useMp3Encode；AC: AC-11 录音 ≤ 60s + MP3。
 */
import { ref } from 'vue'
import lamejs from '@breezystack/lamejs'

export interface Mp3EncodeOptions {
  /** 比特率 kbps，默认 128 */
  kbps?: number
  /** 强制单声道（默认 true，省体积） */
  mono?: boolean
  /** 重采样目标采样率；不传则保留源采样率 */
  targetSampleRate?: number
}

export interface Mp3EncodeResult {
  blob: Blob
  /** 编码后大小（字节） */
  size: number
  /** 时长（秒） */
  duration: number
  /** 实际采样率 */
  sampleRate: number
  /** 实际声道数 */
  channels: number
  /** 编码耗时（ms） */
  encodeMs: number
}

/** Float32 PCM → Int16 PCM（lamejs 要求 16 bit） */
function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i += 1) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

/** 简易线性重采样（仅用于把高采样率降到 lamejs 推荐范围） */
function downsample(buf: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (dstRate === srcRate) return buf
  const ratio = srcRate / dstRate
  const newLen = Math.round(buf.length / ratio)
  const out = new Float32Array(newLen)
  let pos = 0
  let acc = 0
  let cnt = 0
  let next = ratio
  for (let i = 0; i < buf.length; i += 1) {
    acc += buf[i]
    cnt += 1
    if (i + 1 >= next) {
      out[pos] = acc / cnt
      pos += 1
      acc = 0
      cnt = 0
      next += ratio
    }
  }
  if (cnt > 0 && pos < newLen) out[pos] = acc / cnt
  return out
}

export function useMp3Encode() {
  const encoding = ref(false)
  const error = ref<string | null>(null)
  const lastResult = ref<Mp3EncodeResult | null>(null)

  async function encode(source: Blob, opts: Mp3EncodeOptions = {}): Promise<Mp3EncodeResult> {
    const kbps = Math.max(64, Math.min(192, opts.kbps ?? 128))
    const mono = opts.mono ?? true
    encoding.value = true
    error.value = null
    const t0 = Date.now()
    try {
      const arr = await source.arrayBuffer()
      const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
      const ac = new Ctx()
      let audioBuf: AudioBuffer
      try {
        audioBuf = await ac.decodeAudioData(arr.slice(0))
      } finally {
        try {
          await ac.close()
        } catch {
          // ignore
        }
      }

      const srcRate = audioBuf.sampleRate
      const dstRate = opts.targetSampleRate ?? (srcRate > 48000 ? 44100 : srcRate)

      // 取通道：mono 强制下混；保留双声道时取前两条
      let left = audioBuf.getChannelData(0)
      let right: Float32Array | null = null
      if (!mono && audioBuf.numberOfChannels >= 2) {
        right = audioBuf.getChannelData(1)
      } else if (mono && audioBuf.numberOfChannels >= 2) {
        const l = audioBuf.getChannelData(0)
        const r = audioBuf.getChannelData(1)
        const merged = new Float32Array(l.length)
        for (let i = 0; i < l.length; i += 1) merged[i] = (l[i] + r[i]) * 0.5
        left = merged
      }

      // 重采样
      if (dstRate !== srcRate) {
        left = downsample(left, srcRate, dstRate)
        if (right) right = downsample(right, srcRate, dstRate)
      }

      const channels = right ? 2 : 1
      const Encoder = (lamejs as unknown as { Mp3Encoder: new (ch: number, sr: number, kb: number) => {
        encodeBuffer: (l: Int16Array, r?: Int16Array) => Int8Array
        flush: () => Int8Array
      } }).Mp3Encoder
      const enc = new Encoder(channels, dstRate, kbps)

      const leftI16 = floatTo16BitPCM(left)
      const rightI16 = right ? floatTo16BitPCM(right) : null

      const chunkSize = 1152 // lamejs 推荐
      const mp3Chunks: Int8Array[] = []
      for (let i = 0; i < leftI16.length; i += chunkSize) {
        const lc = leftI16.subarray(i, i + chunkSize)
        const rc = rightI16 ? rightI16.subarray(i, i + chunkSize) : undefined
        const out = rc ? enc.encodeBuffer(lc, rc) : enc.encodeBuffer(lc)
        if (out.length > 0) mp3Chunks.push(out)
      }
      const tail = enc.flush()
      if (tail.length > 0) mp3Chunks.push(tail)

      const blob = new Blob(mp3Chunks, { type: 'audio/mpeg' })
      const result: Mp3EncodeResult = {
        blob,
        size: blob.size,
        duration: leftI16.length / dstRate,
        sampleRate: dstRate,
        channels,
        encodeMs: Date.now() - t0,
      }
      lastResult.value = result
      return result
    } catch (e) {
      const msg = (e as Error)?.message || 'mp3 encode failed'
      error.value = msg
      throw new Error(msg)
    } finally {
      encoding.value = false
    }
  }

  return {
    encoding,
    error,
    lastResult,
    encode,
  }
}
