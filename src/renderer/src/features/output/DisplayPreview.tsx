import { useEffect, useRef, useState } from 'react'
import type { OutputState, Rect } from '../../../../shared/output'
import { cn } from '@/lib/utils'

// Prévia proporcional do desktop virtual: monitores, avatar e legenda na escala real.
export function DisplayPreview({ state }: { state: OutputState }) {
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
  // Cabe na largura do painel sem passar de 170 px de altura.
  const scale = Math.min(width / (maxX - minX || 1), 170 / (maxY - minY || 1))
  const box = (b: Rect) => ({ left: (b.x - minX) * scale, top: (b.y - minY) * scale, width: b.width * scale, height: b.height * scale })
  const { avatar, caption, presentation } = state.settings
  const item = 'absolute overflow-hidden rounded-xs px-1 py-0.5 font-mono text-[9px] whitespace-nowrap'
  const telaoDisplay = ds.find((d) => d.id === presentation.displayId) ?? ds.find((d) => !d.primary) ?? ds[0]

  return (
    <div ref={ref} className="w-full">
      <div className="relative mx-auto overflow-hidden rounded-md bg-app" style={{ width: Math.round((maxX - minX) * scale), height: Math.round((maxY - minY) * scale) }} aria-label="Prévia do posicionamento nos monitores">
        {ds.map((d) => (
          <div key={d.id} className={cn(item, 'border border-line bg-monitor text-fg-3', d.primary && 'border-line-strong')} style={box(d.bounds)}>
            {d.label} · {Math.round(d.scaleFactor * 100)}%{d.primary ? ' · principal' : ''}
            {state.presentationOpen && telaoDisplay?.id === d.id && <span className="ml-1 text-success">· Telão</span>}
          </div>
        ))}
        {/* Inativo: contorno tracejado (sem opacidade, para manter o texto legível). */}
        <div
          className={cn(item, 'text-center', caption.visible && state.overlayActive ? 'border border-fg-3 bg-black/75 text-white' : 'border border-dashed border-line-strong text-fg-2')}
          style={box(state.bounds.caption)}
        >
          Legenda
        </div>
        <div className={cn(item, avatar.visible && state.overlayActive ? 'border border-brand bg-brand/25 text-fg' : 'border border-dashed border-brand/70 text-fg-2')} style={box(state.bounds.avatar)}>
          Avatar
        </div>
      </div>
    </div>
  )
}
