import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'

type OnDrag = (dx: number, dy: number, start: { width: number; height: number }) => void

// Arrasto de alça com captura do ponteiro; um comando por frame enquanto a janela muda de tamanho.
export function useDragResize(onDrag: OnDrag) {
  const latest = useRef(onDrag)
  useEffect(() => {
    latest.current = onDrag
  })

  return useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    const start = { x: e.screenX, y: e.screenY, width: window.innerWidth, height: window.innerHeight }
    let raf = 0
    const move = (ev: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => latest.current(ev.screenX - start.x, ev.screenY - start.y, start))
    }
    const end = () => {
      cancelAnimationFrame(raf)
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', end)
      handle.removeEventListener('pointercancel', end)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
  }, [])
}
