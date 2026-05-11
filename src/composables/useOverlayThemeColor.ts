/**
 * useOverlayThemeColor
 *
 * 解决 iOS Safari 顶部状态栏 + 底部 minimal URL bar 的「白条」问题。
 *
 * 背景：iOS Safari 把 status bar 与 minimal URL bar 当作浏览器自己的 chrome 区，
 * webview 内的 `position: fixed; inset: 0; min-height: 100dvh` 元素**永远盖不到**这两块区域，
 * 它们的背景色完全由 `<meta name="theme-color" content="...">` 决定。
 *
 * 因此当半透明浮层打开时，webview 内整屏被遮罩盖暗，但 chrome 区仍是 page-bg 色，
 * 视觉上看起来「上下两条没被遮罩盖住」。
 *
 * 解法：浮层 mounted / open 时把 theme-color 切到「遮罩叠加在 page-bg 上的近似色」，
 * close / unmount 时还原。多个浮层叠加时用栈管理，弹出最近一次 push 的颜色。
 *
 * 颜色辅助函数 mixOnBg() 会自动按 page-bg(#fff8f5) 与 (rgba) 计算叠加色，
 * 各浮层只需告诉自己 mask 的 rgb + alpha 即可，不用手算 hex。
 */

import { onBeforeUnmount, onMounted, watch, type Ref } from 'vue'

const PAGE_BG = { r: 0xff, g: 0xf8, b: 0xf5 } // var(--color-bg)

/** 计算半透明色叠加在 page-bg 上的近似不透明色 hex（normal blending） */
function mixOnBg(maskR: number, maskG: number, maskB: number, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha))
  const r = Math.round(PAGE_BG.r * (1 - a) + maskR * a)
  const g = Math.round(PAGE_BG.g * (1 - a) + maskG * a)
  const b = Math.round(PAGE_BG.b * (1 - a) + maskB * a)
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

interface ThemeStackItem {
  id: number
  color: string
}

const stack: ThemeStackItem[] = []
let metaEl: HTMLMetaElement | null = null
let originalColor = ''
let nextId = 1

function ensureMeta(): HTMLMetaElement | null {
  if (typeof document === 'undefined') return null
  if (metaEl) return metaEl
  let el = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', 'theme-color')
    document.head.appendChild(el)
  }
  metaEl = el
  originalColor = el.getAttribute('content') || '#fff8f5'
  return el
}

function applyTop() {
  const el = ensureMeta()
  if (!el) return
  el.setAttribute('content', stack.length > 0 ? stack[stack.length - 1].color : originalColor)
}

function pushColor(color: string): number {
  const id = nextId++
  stack.push({ id, color })
  applyTop()
  return id
}

function popById(id: number) {
  const idx = stack.findIndex((it) => it.id === id)
  if (idx < 0) return
  stack.splice(idx, 1)
  applyTop()
}

/**
 * 计算浮层应使用的 theme-color。
 * 各浮层调用时把自己 mask 的 rgba 传入，本函数会算出叠加在 page-bg 上的近似色。
 *
 * @example
 *   useOverlayThemeColor(() => props.open, overlayMaskColor(20, 20, 20, 0.42))
 */
export function overlayMaskColor(r: number, g: number, b: number, a: number): string {
  return mixOnBg(r, g, b, a)
}

/**
 * 把当前组件 open 状态绑定到全局 theme-color 栈：
 * - open=true → push 颜色，状态栏/URL bar 立即变暗
 * - open=false → pop 颜色
 * - 组件卸载时若仍 open → 自动 pop，避免泄漏
 *
 * 多个浮层同时打开 / 嵌套时，栈管理保证恢复正确。
 */
export function useOverlayThemeColor(isOpen: () => boolean, color: string): void {
  let myId: number | null = null

  const sync = (open: boolean) => {
    if (open && myId == null) {
      myId = pushColor(color)
    } else if (!open && myId != null) {
      popById(myId)
      myId = null
    }
  }

  // 组件 mount 时立即同步一次（覆盖一开始就 open=true 的场景）
  onMounted(() => sync(isOpen()))
  watch(isOpen, (v) => sync(v))
  onBeforeUnmount(() => {
    if (myId != null) {
      popById(myId)
      myId = null
    }
  })
}

/**
 * 直接传 Ref<boolean> 的便捷重载（避免每个组件写 () => xxx.value）
 */
export function useOverlayThemeColorRef(openRef: Ref<boolean>, color: string): void {
  useOverlayThemeColor(() => openRef.value, color)
}
