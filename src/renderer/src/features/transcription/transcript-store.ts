// Histórico da transcrição ao vivo: um registro por segmento de fala, com revisões dos parciais.
import { createStore } from 'zustand/vanilla'
import { nowMs } from '@/lib/telemetry'

export type TranscriptStatus = 'listening' | 'partial' | 'processing' | 'final' | 'empty' | 'error'

export interface TranscriptEntry {
  seg: string
  at: number
  text: string
  status: TranscriptStatus
  rev: number
  repaired?: boolean
  error?: string
}

const MAX_ENTRIES = 2000
const FINISHED = new Set<TranscriptStatus>(['final', 'empty', 'error'])

export const transcriptStore = createStore(() => ({ entries: [] as TranscriptEntry[] }))

function upsert(seg: string, change: (e: TranscriptEntry | undefined) => TranscriptEntry | null) {
  const { entries } = transcriptStore.getState()
  const idx = entries.findLastIndex((e) => e.seg === seg)
  const next = change(entries[idx])
  if (!next) return false
  const copy = idx === -1 ? [...entries, next].slice(-MAX_ENTRIES) : entries.with(idx, next)
  transcriptStore.setState({ entries: copy })
  return true
}

const fresh = (seg: string): TranscriptEntry => ({ seg, at: nowMs(), text: '', status: 'listening', rev: 0 })

export const transcript = {
  voice: (seg: string) => upsert(seg, (e) => (e ? null : fresh(seg))),

  // Revisões fora de ordem ou após o final são descartadas.
  partial: (seg: string, text: string, rev: number) =>
    upsert(seg, (e) => {
      const base = e ?? fresh(seg)
      if (FINISHED.has(base.status) || rev <= base.rev) return null
      return { ...base, text, rev, status: 'partial' }
    }),

  processing: (seg: string) => upsert(seg, (e) => (e && FINISHED.has(e.status) ? null : { ...(e ?? fresh(seg)), status: 'processing' })),

  // Idempotente: um segmento só é consolidado uma vez.
  final: (seg: string, text: string, repaired = false) =>
    upsert(seg, (e) => (e?.status === 'final' ? null : { ...(e ?? fresh(seg)), text, repaired, status: 'final', rev: Number.MAX_SAFE_INTEGER })),

  empty: (seg: string) => upsert(seg, (e) => (e && FINISHED.has(e.status) ? null : e ? { ...e, status: 'empty' } : null)),

  error: (seg: string, error: string) => upsert(seg, (e) => (e?.status === 'final' ? null : { ...(e ?? fresh(seg)), status: 'error', error })),

  clear: () => transcriptStore.setState({ entries: [] }),
}
