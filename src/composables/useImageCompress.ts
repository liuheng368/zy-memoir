/**
 * src/composables/useImageCompress.ts — 浏览器内图片压缩到 ≤ 3 MB
 *
 * 选型：plan.md Q-PLAN-6 = `browser-image-compression`（API 简洁、~25 KB）
 * AC: AC-10 图片压缩 ≤ 3 MB（最终在 COS 中文件 size ≤ 3 MB）
 *
 * 用法：
 *   const { compress, lastRatio } = useImageCompress()
 *   const file = await compress(rawFile)   // 返回压缩后的 File
 */
import { ref } from 'vue'
import imageCompression from 'browser-image-compression'
import { MAX_IMAGE_BYTES } from '@/utils/constants'

export interface CompressOptions {
  /** 最大体积（字节）。默认 3 MB */
  maxBytes?: number
  /** 最大边长。默认 2048 px（兼顾清晰与体积） */
  maxWidthOrHeight?: number
  /** 压缩超时（ms）。默认 30 s */
  timeoutMs?: number
}

export function useImageCompress() {
  /** 上一次压缩前体积（字节） */
  const lastSourceBytes = ref(0)
  /** 上一次压缩后体积（字节） */
  const lastTargetBytes = ref(0)
  /** 上一次压缩比 = target / source（< 1 表示有效压缩） */
  const lastRatio = ref(1)

  async function compress(file: File, options: CompressOptions = {}): Promise<File> {
    const maxBytes = options.maxBytes ?? MAX_IMAGE_BYTES
    const maxMB = maxBytes / 1024 / 1024
    lastSourceBytes.value = file.size
    // 已经小于阈值就直接返回，避免无谓的解码 / 编码开销
    if (file.size <= maxBytes) {
      lastTargetBytes.value = file.size
      lastRatio.value = 1
      return file
    }
    const compressed = await imageCompression(file, {
      maxSizeMB: maxMB,
      maxWidthOrHeight: options.maxWidthOrHeight ?? 2048,
      useWebWorker: true,
      // 与原始文件 MIME 对齐；如非 jpeg/png/webp 则降为 jpeg
      fileType: ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
        ? file.type
        : 'image/jpeg',
    })
    lastTargetBytes.value = compressed.size
    lastRatio.value = file.size > 0 ? compressed.size / file.size : 1
    // 库返回的是 File（带 name），直接返回即可
    return compressed as File
  }

  return {
    lastSourceBytes,
    lastTargetBytes,
    lastRatio,
    compress,
  }
}
