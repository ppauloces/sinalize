// Geometria multi-monitor do overlay (funções puras; coordenadas em DIP, como a Screen API do Electron).
const MARGIN = 24

function anchorPosition(anchor, size, area, margin = MARGIN) {
  const left = area.x + margin
  const right = area.x + area.width - size.width - margin
  const top = area.y + margin
  const bottom = area.y + area.height - size.height - margin
  const cx = area.x + Math.round((area.width - size.width) / 2)
  const cy = area.y + Math.round((area.height - size.height) / 2)
  const points = {
    'top-left': [left, top],
    'top-right': [right, top],
    'bottom-left': [left, bottom],
    'bottom-right': [right, bottom],
    center: [cx, cy],
    'bottom-center': [cx, bottom],
  }
  const [x, y] = points[anchor] || points['bottom-right']
  return { x, y }
}

// Mantém o retângulo inteiro dentro da área; se for maior que ela, alinha pela origem.
function fitInArea(rect, area) {
  return {
    ...rect,
    x: Math.max(area.x, Math.min(rect.x, area.x + area.width - rect.width)),
    y: Math.max(area.y, Math.min(rect.y, area.y + area.height - rect.height)),
  }
}

function overlap(a, b) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

// Monitor com maior interseção; null se o retângulo não toca nenhuma tela.
function displayForRect(rect, displays) {
  let best = null
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
function resolveBounds(el, sizeFor, displays, primary, { useFullBounds = false, fallbackAnchor = 'bottom-right' } = {}) {
  const areaOf = (d) => (useFullBounds ? d.bounds : d.workArea)
  if (el.anchor === 'custom' && Number.isFinite(el.x) && Number.isFinite(el.y)) {
    const guess = { x: el.x, y: el.y, ...sizeFor(primary.workArea) }
    const home = displayForRect(guess, displays)
    if (home) {
      const area = areaOf(home)
      return { ...fitInArea({ x: el.x, y: el.y, ...sizeFor(area) }, area), displayId: home.id }
    }
  }
  const display = displays.find((d) => d.id === el.displayId) || primary
  const area = areaOf(display)
  const size = sizeFor(area)
  const anchor = el.anchor === 'custom' ? fallbackAnchor : el.anchor
  return { ...fitInArea({ ...size, ...anchorPosition(anchor, size, area) }, area), displayId: display.id }
}

module.exports = { MARGIN, anchorPosition, fitInArea, displayForRect, resolveBounds }
