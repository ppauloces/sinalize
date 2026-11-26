import { formatClock } from '@/lib/format'
import { sessionStore } from '../session/session-store'
import { transcriptStore, type TranscriptEntry } from './transcript-store'

// Linhas "[hh:mm:ss] texto" relativas ao início da sessão (ou à primeira fala).
export function transcriptLines(entries: TranscriptEntry[] = transcriptStore.getState().entries) {
  const finals = entries.filter((e) => e.status === 'final')
  const origin = sessionStore.getState().startedAt ?? finals[0]?.at ?? 0
  return finals.map((e) => `[${formatClock(e.at - origin)}] ${e.text}`)
}

export async function copyTranscript() {
  await navigator.clipboard.writeText(transcriptLines().join('\n'))
}

export function downloadText(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

export function exportTranscript() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  downloadText(`sinalize-transcricao-${stamp}.txt`, transcriptLines().join('\n') + '\n')
}
