// Modelo da janela de legendas flutuantes, alimentado pelos eventos espelhados do Studio.
import type { CaptionEvent, CaptionLineState, CaptionSource } from '../../../../shared/overlay'

const MAX_FINALS = 20

export interface OverlayCaptionModel {
  finals: { seg: string; text: string; state: CaptionLineState }[]
  partial: { seg: string; text: string } | null
}

export const emptyCaption: OverlayCaptionModel = { finals: [], partial: null }

export function reduceCaption(m: OverlayCaptionModel, ev: CaptionEvent): OverlayCaptionModel {
  switch (ev.kind) {
    case 'final':
      return {
        finals: [...m.finals.filter((f) => f.seg !== ev.seg), { seg: ev.seg, text: ev.text, state: 'pending' as const }].slice(-MAX_FINALS),
        partial: m.partial?.seg === ev.seg ? null : m.partial,
      }
    case 'partial':
      return { ...m, partial: { seg: ev.seg, text: ev.text } }
    case 'state':
      return { ...m, finals: m.finals.map((f) => (f.seg === ev.seg ? { ...f, state: ev.state } : f)) }
    case 'clear':
      return emptyCaption
  }
}

// live: fala em tempo real (inclui o trecho provisório) · final: só texto consolidado
// signing: frase entregue ao player; o VLibras não expõe progresso por sinal, então não há sincronia fina.
// `ended` indica que a permanência após a fala já pode começar a contar.
export function captionText(m: OverlayCaptionModel, source: CaptionSource): { text: string; ended: boolean } {
  if (source === 'signing') {
    const signing = m.finals.find((f) => f.state === 'signing')
    if (signing) return { text: signing.text, ended: false }
    return { text: m.finals.findLast((f) => f.state === 'done')?.text ?? '', ended: true }
  }
  const parts = m.finals.map((f) => f.text)
  if (source === 'live' && m.partial) parts.push(m.partial.text)
  return { text: parts.slice(-6).join(' '), ended: true }
}
