const TCB_FILE_HOST_PATTERN = /\.tcb\.qcloud\.la$/i

export function proxiedMediaUrl(url: string | null | undefined): string {
  if (!url) return ''
  if (typeof window === 'undefined') return url
  if (import.meta.env.VITE_TCB_PROXY !== 'edgeone') return url
  try {
    const parsed = new URL(url, window.location.origin)
    if (!TCB_FILE_HOST_PATTERN.test(parsed.host)) return url
    return new URL(`/tcb-file${parsed.pathname}${parsed.search}${parsed.hash}`, window.location.origin)
      .toString()
  } catch {
    return url
  }
}
