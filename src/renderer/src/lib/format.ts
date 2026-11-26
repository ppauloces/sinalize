const pad = (n: number) => String(n).padStart(2, '0')

// hh:mm:ss para cronômetro de sessão e timestamps da transcrição.
export function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`
}

export const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`

export const formatMs = (ms: number | null | undefined) => (ms == null ? '—' : ms >= 1000 ? formatSeconds(ms) : `${Math.round(ms)} ms`)
