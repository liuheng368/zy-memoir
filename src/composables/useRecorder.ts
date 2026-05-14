/**
 * src/composables/useRecorder.ts — MediaRecorder 包装 + 60 s 倒计时
 *
 * 选型：plan Q-PLAN-7 = 原生 `MediaRecorder`；iOS Safari 14+ 支持。
 * 输出：原始格式 Blob（audio/webm 优先 / 不支持时 audio/mp4），由上层调
 *       `useMp3Encode` 转 MP3 后上传，规避后端转码（plan Q-PLAN-5）。
 *
 * 状态机：
 *   idle → recording → stopped（含 blob/duration）  ─ 用户主动 stop
 *           │└ 60 s ┘ → stopped                     ─ AC-11 自动停止
 *           └→ error                                ─ 设备拒绝授权 / 流异常
 *
 * Plan: G8 useRecorder（**⚠️** iOS Safari spike）；AC: AC-11。
 */
import { onScopeDispose, ref } from 'vue'
import { MAX_RECORDING_SECONDS } from '@/utils/constants'

export type RecorderStatus = 'idle' | 'recording' | 'stopped' | 'error'

/** 选一个可用的 MIME（优先 webm；iOS 通常落到 mp4） */
function pickMime(): string {
  const cands = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/aac',
  ]
  if (typeof MediaRecorder === 'undefined') return ''
  for (const m of cands) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m
    } catch {
      // ignore
    }
  }
  return ''
}

function normalizeStartError(e: unknown): string {
  const err = e as Error & { name?: string }
  const name = err?.name || ''
  const message = err?.message || ''
  const lowerMessage = message.toLowerCase()

  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    name === 'SecurityError' ||
    lowerMessage.includes('permission denied')
  ) {
    if (lowerMessage.includes('system')) {
      return '系统已禁止浏览器使用麦克风，请在系统设置或浏览器设置中允许麦克风权限后重试'
    }
    return '麦克风权限被拒绝，请在浏览器地址栏或系统设置中允许麦克风权限后重试'
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return '没有检测到可用麦克风，请连接麦克风后重试'
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return '麦克风正在被其他应用占用，请关闭占用麦克风的应用后重试'
  }

  if (name === 'OverconstrainedError') {
    return '当前麦克风不满足录音要求，请更换设备后重试'
  }

  if (name === 'AbortError') {
    return '麦克风启动被中断，请稍后重试'
  }

  return message || '麦克风启动失败'
}

export function useRecorder() {
  const status = ref<RecorderStatus>('idle')
  const elapsed = ref(0) // 秒
  const blob = ref<Blob | null>(null)
  const mime = ref<string>('')
  const error = ref<string | null>(null)
  /** 最大允许时长（默认 60s，可外部覆盖） */
  const maxSeconds = ref(MAX_RECORDING_SECONDS)

  let _recorder: MediaRecorder | null = null
  let _stream: MediaStream | null = null
  let _chunks: Blob[] = []
  let _ticker: ReturnType<typeof setInterval> | null = null
  let _stopResolve: ((b: Blob) => void) | null = null
  let _stopReject: ((e: Error) => void) | null = null

  function clearTicker() {
    if (_ticker) {
      clearInterval(_ticker)
      _ticker = null
    }
  }

  function disposeStream() {
    if (_stream) {
      _stream.getTracks().forEach((t) => {
        try {
          t.stop()
        } catch {
          // ignore
        }
      })
      _stream = null
    }
    _recorder = null
  }

  async function start(): Promise<void> {
    if (status.value === 'recording') return
    error.value = null
    blob.value = null
    elapsed.value = 0
    _chunks = []
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const msg = '当前浏览器不支持录音（getUserMedia）'
      error.value = msg
      status.value = 'error'
      throw new Error(msg)
    }
    if (typeof MediaRecorder === 'undefined') {
      const msg = '当前浏览器不支持 MediaRecorder'
      error.value = msg
      status.value = 'error'
      throw new Error(msg)
    }
    try {
      _stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      const msg = normalizeStartError(e)
      error.value = msg
      status.value = 'error'
      throw new Error(msg)
    }
    const m = pickMime()
    mime.value = m
    try {
      _recorder = m ? new MediaRecorder(_stream, { mimeType: m }) : new MediaRecorder(_stream)
    } catch (e) {
      // Safari 个别版本即使 isTypeSupported 返 true 也会构造失败 → 退化为不带 mimeType
      try {
        _recorder = new MediaRecorder(_stream)
        mime.value = _recorder.mimeType || ''
      } catch (ee) {
        const msg = (ee as Error)?.message || (e as Error)?.message || '无法创建 MediaRecorder'
        error.value = msg
        status.value = 'error'
        disposeStream()
        throw new Error(msg)
      }
    }

    _recorder.addEventListener('dataavailable', (ev: BlobEvent) => {
      if (ev.data && ev.data.size > 0) _chunks.push(ev.data)
    })
    _recorder.addEventListener('error', (ev: Event) => {
      const msg = (ev as unknown as { error?: Error }).error?.message || 'recorder error'
      error.value = msg
      status.value = 'error'
      clearTicker()
      disposeStream()
      if (_stopReject) {
        _stopReject(new Error(msg))
        _stopResolve = null
        _stopReject = null
      }
    })
    _recorder.addEventListener('stop', () => {
      clearTicker()
      const out = new Blob(_chunks, { type: mime.value || 'audio/webm' })
      blob.value = out
      status.value = 'stopped'
      disposeStream()
      if (_stopResolve) {
        _stopResolve(out)
        _stopResolve = null
        _stopReject = null
      }
    })

    _recorder.start(/* timeslice */ 250)
    status.value = 'recording'
    const t0 = Date.now()
    _ticker = setInterval(() => {
      elapsed.value = Math.floor((Date.now() - t0) / 1000)
      if (elapsed.value >= maxSeconds.value) {
        // AC-11：到达上限自动停止
        stop().catch(() => undefined)
      }
    }, 200)
  }

  function stop(): Promise<Blob> {
    if (!_recorder || status.value !== 'recording') {
      return Promise.resolve(blob.value ?? new Blob([], { type: mime.value || 'audio/webm' }))
    }
    return new Promise<Blob>((resolve, reject) => {
      _stopResolve = resolve
      _stopReject = reject
      try {
        _recorder?.stop()
      } catch (e) {
        reject(e as Error)
      }
    })
  }

  function cancel(): void {
    clearTicker()
    if (_recorder && status.value === 'recording') {
      try {
        _recorder.stop()
      } catch {
        // ignore
      }
    }
    disposeStream()
    _chunks = []
    blob.value = null
    elapsed.value = 0
    status.value = 'idle'
    _stopResolve = null
    _stopReject = null
  }

  // 组件卸载兜底，防止麦克风一直被占用
  onScopeDispose(() => {
    cancel()
  })

  return {
    status,
    elapsed,
    blob,
    mime,
    error,
    maxSeconds,
    start,
    stop,
    cancel,
  }
}

/** 工具：判断当前环境是否能录音（用于 UI 灰显 + 文案） */
export function canRecord(): boolean {
  if (typeof navigator === 'undefined') return false
  if (!navigator.mediaDevices?.getUserMedia) return false
  if (typeof MediaRecorder === 'undefined') return false
  return true
}
