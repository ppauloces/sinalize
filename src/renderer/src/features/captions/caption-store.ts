// Legenda do monitor, independente da fila do avatar.
// Frases finais em ordem de segmento; o parcial (fala em andamento) fica sempre por último.
// Cada mudança é espelhada nas janelas de saída (Telão e legendas flutuantes).
import { createStore } from 'zustand/vanilla'
import type { CaptionEvent, CaptionLineState } from '../../../../shared/output'

const MAX_LINES = 200
// Limite visual por frase: um segmento anômalo nunca ocupa a área inteira da legenda.
export const MAX_CAPTION_CHARS = 280

export interface CaptionLine {
  seg: string
  text: string
  state: CaptionLineState
}

export interface CaptionState {
  finals: CaptionLine[]
  partial: { seg: string; text: string } | null
  revision: number
}

const segOrder = (seg: string) => Number(seg.split('-').pop()) || Infinity
const clip = (text: string) => (text.length > MAX_CAPTION_CHARS ? '…' + text.slice(-MAX_CAPTION_CHARS) : text)

export class CaptionStore {
  readonly store = createStore<CaptionState>(() => ({ finals: [], partial: null, revision: 0 }))

  constructor(private readonly mirror: (ev: CaptionEvent) => void = () => {}) {}

  addFinal(seg: string, rawText: string) {
    const text = clip(rawText)
    this.store.setState((s) => {
      // O final de N pode chegar depois do parcial de N+1: insere antes do 1º segmento posterior.
      const later = s.finals.findIndex((l) => segOrder(l.seg) > segOrder(seg))
      const finals = [...s.finals.filter((l) => l.seg !== seg)]
      finals.splice(later === -1 ? finals.length : later, 0, { seg, text, state: 'pending' })
      return { finals: finals.slice(-MAX_LINES), partial: s.partial?.seg === seg ? null : s.partial, revision: s.revision + 1 }
    })
    this.mirror({ kind: 'final', seg, text })
  }

  setPartial(seg: string, rawText: string) {
    // ignora parcial atrasado de um segmento que já tem texto final
    if (this.store.getState().finals.some((l) => l.seg === seg)) return
    const text = clip(rawText)
    this.store.setState({ partial: { seg, text } })
    this.mirror({ kind: 'partial', seg, text })
  }

  mark(seg: string, state: CaptionLineState) {
    this.store.setState((s) => ({ finals: s.finals.map((l) => (l.seg === seg ? { ...l, state } : l)) }))
    this.mirror({ kind: 'state', seg, state })
  }

  clear() {
    this.store.setState({ finals: [], partial: null })
    this.mirror({ kind: 'clear' })
  }
}
