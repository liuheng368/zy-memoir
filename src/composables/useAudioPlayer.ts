/**
 * src/composables/useAudioPlayer.ts — 全局单实例音频播放器（互斥）
 *
 * 设计目标（plan §技术选型 / 约束 + AC-12 录音播放互斥）：
 * - 同一时间至多一条音频在播：切歌时先 pause 旧的，再播新的；
 * - 任意组件调用 `useAudioPlayer()` 拿到的都是**模块级共享**的响应式状态，
 *   主页 TeacherCard / 学生浮层 / 老师浮层共享同一播放器；
 * - 不引第三方播放库，原生 `<audio>` HTMLElement 即可（不挂 DOM）。
 *
 * 使用：
 *   const player = useAudioPlayer()
 *   await player.toggle(rec.url)          // 切歌 / 暂停
 *   player.isPlaying(rec.url)             // boolean — 当前 url 是否在播
 *   player.progress(rec.url)              // 0~1 — 仅当前曲目有意义；其它返回 0
 *
 * Plan: G8 useAudioPlayer
 * AC: AC-12 录音播放互斥
 */
import { computed, onScopeDispose, ref } from 'vue'

/** 模块级 audio 实例（首次 use 时惰性创建） */
let _audioEl: HTMLAudioElement | null = null

const _currentUrl = ref<string | null>(null)
const _playing = ref(false)
const _currentTime = ref(0)
const _duration = ref(0)
const _error = ref<string | null>(null)
/** 引用计数：所有组件 unmount 后销毁 audio 实例（节省资源） */
let _refCount = 0

function ensureAudio(): HTMLAudioElement {
  if (_audioEl) return _audioEl
  const el = new Audio()
  el.preload = 'metadata'
  el.addEventListener('play', () => {
    _playing.value = true
    _error.value = null
  })
  el.addEventListener('pause', () => {
    _playing.value = false
  })
  el.addEventListener('ended', () => {
    _playing.value = false
    _currentTime.value = 0
  })
  el.addEventListener('timeupdate', () => {
    _currentTime.value = el.currentTime || 0
  })
  el.addEventListener('loadedmetadata', () => {
    _duration.value = Number.isFinite(el.duration) ? el.duration : 0
  })
  el.addEventListener('error', () => {
    _playing.value = false
    _error.value = el.error ? `code=${el.error.code}` : 'audio error'
  })
  _audioEl = el
  return el
}

function disposeAudio(): void {
  if (!_audioEl) return
  try {
    _audioEl.pause()
    _audioEl.removeAttribute('src')
    _audioEl.load()
  } catch {
    // ignore
  }
  _audioEl = null
  _currentUrl.value = null
  _playing.value = false
  _currentTime.value = 0
  _duration.value = 0
}

export interface AudioPlayerHandle {
  /** 当前正在播放的 url（无则 null） */
  currentUrl: typeof _currentUrl
  /** 是否处于播放中 */
  playing: typeof _playing
  /** 当前播放进度（秒） */
  currentTime: typeof _currentTime
  /** 当前曲目总时长（秒；元数据加载完后才有效） */
  duration: typeof _duration
  /** 错误信息（如解码失败） */
  error: typeof _error

  /** 检查指定 url 是否正在播 */
  isPlaying(url: string): boolean
  /** 指定 url 的播放进度 0~1（非当前曲目恒为 0） */
  progress(url: string): number

  /** 播放指定 url（自动切歌） */
  play(url: string): Promise<void>
  /** 暂停（不重置进度） */
  pause(): void
  /** 切歌 / 切暂停 */
  toggle(url: string): Promise<void>
  /** 停止并重置 */
  stop(): void
}

export function useAudioPlayer(): AudioPlayerHandle {
  // 引用计数：让最后一个 onScopeDispose 时销毁 audio
  _refCount += 1
  onScopeDispose(() => {
    _refCount = Math.max(0, _refCount - 1)
    if (_refCount === 0) disposeAudio()
  })

  function isPlaying(url: string): boolean {
    return _playing.value && _currentUrl.value === url
  }
  function progress(url: string): number {
    if (_currentUrl.value !== url) return 0
    if (!_duration.value) return 0
    return Math.min(1, Math.max(0, _currentTime.value / _duration.value))
  }
  async function play(url: string): Promise<void> {
    if (!url) return
    const el = ensureAudio()
    if (_currentUrl.value !== url) {
      try {
        el.pause()
      } catch {
        // ignore
      }
      el.src = url
      _currentUrl.value = url
      _currentTime.value = 0
      _duration.value = 0
      _error.value = null
    }
    try {
      await el.play()
    } catch (e) {
      _error.value = (e as Error)?.message ?? 'play failed'
      _playing.value = false
      throw e
    }
  }
  function pause(): void {
    if (!_audioEl) return
    try {
      _audioEl.pause()
    } catch {
      // ignore
    }
  }
  async function toggle(url: string): Promise<void> {
    if (isPlaying(url)) {
      pause()
      return
    }
    await play(url)
  }
  function stop(): void {
    if (!_audioEl) return
    try {
      _audioEl.pause()
      _audioEl.currentTime = 0
    } catch {
      // ignore
    }
    _playing.value = false
    _currentTime.value = 0
  }

  return {
    currentUrl: _currentUrl,
    playing: _playing,
    currentTime: _currentTime,
    duration: _duration,
    error: _error,
    isPlaying,
    progress,
    play,
    pause,
    toggle,
    stop,
  }
}

/** 测试 / HMR 重置使用 */
export function _resetForTest(): void {
  disposeAudio()
  _refCount = 0
}

/** 模块级 readonly 计算便利项（暴露给某些只读场景） */
export const isAnyAudioPlaying = computed(() => _playing.value)
