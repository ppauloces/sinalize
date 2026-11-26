// Legenda integral do Studio, independente da fila do avatar.
// Frases finais em ordem de segmento; o parcial (fala em andamento) fica sempre por último.
// Cada mudança é espelhada na janela de legendas flutuantes.
import type { CaptionEvent, CaptionLineState } from '../../../../shared/overlay'
import { createStore } from '@/lib/store'

const MAX_LINES = 200

export interface CaptionLine {
  seg: string
  text: string
  state: CaptionLineState
}

export interface CaptionState {
  finals: CaptionLine[]
  partial: { seg: string; text: string } | null
  revision: number // muda a cada frase final (dispara a animação de entrada)
}

const segOrder = (seg: string) => Number(seg.split('-').pop()) || Infinity

export class CaptionStore {
  readonly store = createStore<CaptionState>({ finals: [], partial: null, revision: 0 })

  constructor(private readonly mirror: (ev: CaptionEvent) => void = () => {}) {}

  addFinal(seg: string, text: string) {
    this.store.set((s) => {
      // O final de N pode chegar depois do parcial de N+1: insere antes do 1º segmento posterior.
      const later = s.finals.findIndex((l) => segOrder(l.seg) > segOrder(seg))
      const finals = [...s.finals]
      finals.splice(later === -1 ? finals.length : later, 0, { seg, text, state: 'pending' })
      return {
        finals: finals.slice(-MAX_LINES),
        partial: s.partial?.seg === seg ? null : s.partial,
        revision: s.revision + 1,
      }
    })
    this.mirror({ kind: 'final', seg, text })
  }

  setPartial(seg: string, text: string) {
    // ignora parcial atrasado de um segmento que já tem texto final
    if (this.store.get().finals.some((l) => l.seg === seg)) return
    this.store.set((s) => ({ ...s, partial: { seg, text } }))
    this.mirror({ kind: 'partial', seg, text })
  }

  mark(seg: string, state: CaptionLineState) {
    this.store.set((s) => ({ ...s, finals: s.finals.map((l) => (l.seg === seg ? { ...l, state } : l)) }))
    this.mirror({ kind: 'state', seg, state })
  }
}
