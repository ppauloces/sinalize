import { useEffect, useRef, useState } from 'react'
import type { OverlayState, Rect } from '../../../../shared/overlay'
import { cn } from '@/lib/utils'

// Prévia proporcional do desktop virtual: monitores, avatar e legenda na escala real.
export function OverlayPreview({ state }: { state: OverlayState }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const ds = state.displays
  const minX = Math.min(...ds.map((d) => d.bounds.x))
  const minY = Math.min(...ds.map((d) => d.bounds.y))
  const maxX = Math.max(...ds.map((d) => d.bounds.x + d.bounds.width))
  const maxY = Math.max(...ds.map((d) => d.bounds.y + d.bounds.height))
  const scale = width / (maxX - minX || 1)
  const box = (b: Rect) => ({ left: (b.x - minX) * scale, top: (b.y - minY) * scale, width: b.width * scale, height: b.height * scale })
  const { avatar, caption } = state.settings
  const item = 'absolute overflow-hidden rounded-[3px] px-1 py-0.5 text-[0.6rem] font-semibold whitespace-nowrap'

  return (
    <div ref={ref} className="relative w-full overflow-hidden rounded-lg bg-muted" style={{ height: Math.round((maxY - minY) * scale) }} aria-label="Prévia do posicionamento nos monitores">
      {ds.map((d) => (
        <div key={d.id} className={cn(item, 'border bg-card text-muted-foreground', d.primary && 'border-ring/50')} style={box(d.bounds)}>
          {d.label} · {Math.round(d.scaleFactor * 100)}%
        </div>
      ))}
      <div className={cn(item, 'border border-slate-900/80 bg-slate-900/60 text-center text-white', !caption.visible && 'border-dashed opacity-35')} style={box(state.bounds.caption)}>
        Legenda
      </div>
      <div className={cn(item, 'border border-ring bg-blue-600/25 text-accent-foreground', !avatar.visible && 'border-dashed opacity-35')} style={box(state.bounds.avatar)}>
        Avatar
      </div>
    </div>
  )
}
