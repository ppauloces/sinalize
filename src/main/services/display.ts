// Geometria multi-monitor do overlay (funções puras; coordenadas em DIP, como a Screen API do Electron).
import type { Anchor, Placement, Rect, ResolvedBounds } from '../../shared/output'

export const MARGIN = 24

export interface DisplayLike {
  id: number
  bounds: Rect
  workArea: Rect
}

type Size = Pick<Rect, 'width' | 'height'>

export function anchorPosition(anchor: Anchor, size: Size, area: Rect, margin = MARGIN) {
  const left = area.x + margin
  const right = area.x + area.width - size.width - margin
  const top = area.y + margin
  const bottom = area.y + area.height - size.height - margin
  const cx = area.x + Math.round((area.width - size.width) / 2)
  const cy = area.y + Math.round((area.height - size.height) / 2)
  const points: Record<Exclude<Anchor, 'custom'>, [number, number]> = {
    'top-left': [left, top],
    'top-right': [right, top],
    'bottom-left': [left, bottom],
    'bottom-right': [right, bottom],
    center: [cx, cy],
    'bottom-center': [cx, bottom],
  }
  const [x, y] = anchor === 'custom' ? points['bottom-right'] : points[anchor]
  return { x, y }
}

// Mantém o retângulo inteiro dentro da área; se for maior que ela, alinha pela origem.
export function fitInArea(rect: Rect, area: Rect): Rect {
  return {
    ...rect,
    x: Math.max(area.x, Math.min(rect.x, area.x + area.width - rect.width)),
    y: Math.max(area.y, Math.min(rect.y, area.y + area.height - rect.height)),
  }
}

function overlap(a: Rect, b: Rect) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

// Monitor com maior interseção; null se o retângulo não toca nenhuma tela.
export function displayForRect<D extends DisplayLike>(rect: Rect, displays: D[]): D | null {
  let best: D | null = null
  let bestArea = 0
  for (const d of displays) {
    const a = overlap(rect, d.bounds)
    if (a > bestArea) {
      best = d
      bestArea = a
    }
  }
  return best
}

// Resolve onde um elemento deve ficar. Nunca devolve uma posição fora das telas disponíveis:
// monitor desconectado → monitor principal; posição livre fora das telas → ponto de ancoragem padrão.
// `sizeFor(area)` deixa o chamador limitar o tamanho à tela de destino sem distorcer proporções.
export function resolveBounds(
  el: Placement,
  sizeFor: (area: Rect) => Size,
  displays: DisplayLike[],
  primary: DisplayLike,
  { useFullBounds = false, fallbackAnchor = 'bottom-right' as Anchor } = {},
): ResolvedBounds {
  const areaOf = (d: DisplayLike) => (useFullBounds ? d.bounds : d.workArea)
  if (el.anchor === 'custom' && Number.isFinite(el.x) && Number.isFinite(el.y)) {
    const x = el.x as number
    const y = el.y as number
    const home = displayForRect({ x, y, ...sizeFor(primary.workArea) }, displays)
    if (home) {
      const area = areaOf(home)
      return { ...fitInArea({ x, y, ...sizeFor(area) }, area), displayId: home.id }
    }
  }
  const display = displays.find((d) => d.id === el.displayId) ?? primary
  const area = areaOf(display)
  const size = sizeFor(area)
  const anchor = el.anchor === 'custom' ? fallbackAnchor : el.anchor
  return { ...fitInArea({ ...size, ...anchorPosition(anchor, size, area) }, area), displayId: display.id }
}
