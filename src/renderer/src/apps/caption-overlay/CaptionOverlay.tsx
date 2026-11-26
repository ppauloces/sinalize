import { useEffect, useReducer, useState, type CSSProperties } from 'react'
import { captionText, emptyCaption, reduceCaption } from '@/features/captions/overlay-caption'
import { cn } from '@/lib/utils'
import { useDragResize } from '../use-drag-resize'
import { useOverlayState } from '../use-overlay-state'

const SAMPLE = 'Exemplo de legenda do Sinalize. Ajuste posição, largura e estilo.'

function hexToRgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${n >> 16} ${(n >> 8) & 255} ${n & 255} / ${alpha})`
}

function WidthHandle({ side }: { side: 'left' | 'right' }) {
  const dir = side === 'left' ? -1 : 1
  // Largura simétrica: a legenda continua centrada enquanto a alça é arrastada.
  const onPointerDown = useDragResize((dx, _dy, start) => void window.sinalize.overlay.command('resizeCaption', Math.round(start.width + 2 * dir * dx)))
  return (
    <div
      title="Largura"
      onPointerDown={onPointerDown}
      className={cn('absolute top-1/2 -mt-[22px] h-11 w-2.5 cursor-ew-resize touch-none rounded-[5px] bg-blue-600 [-webkit-app-region:no-drag]', side === 'left' ? 'left-0.5' : 'right-0.5')}
    />
  )
}

export function CaptionOverlay() {
  const state = useOverlayState()
  const [model, dispatch] = useReducer(reduceCaption, emptyCaption)
  // Texto que já cumpriu o tempo de permanência (fica oculto até mudar).
  const [expired, setExpired] = useState<string | null>(null)

  useEffect(() => window.sinalize.caption.onEvent(dispatch), [])

  const caption = state?.settings.caption
  const editing = state?.editing ?? true
  const { text: live, ended } = caption ? captionText(model, caption.source) : { text: '', ended: true }
  const text = live || (editing ? SAMPLE : '')
  const visible = !!text && (editing || expired !== text)
  const holdMs = caption?.holdMs ?? 0

  // Tempo de permanência após o término da fala (ou do segmento em sinalização); 0 = sempre visível.
  useEffect(() => {
    if (editing || holdMs === 0 || !ended || !text) return
    const timer = setTimeout(() => setExpired(text), holdMs)
    return () => clearTimeout(timer)
  }, [text, ended, editing, holdMs, model])

  if (!caption) return null
  const pad = Math.round(caption.fontSize * 0.35)
  const style: CSSProperties = {
    fontFamily: `'${caption.fontFamily}', 'Segoe UI', system-ui, sans-serif`,
    fontSize: caption.fontSize,
    fontWeight: caption.fontWeight,
    lineHeight: caption.lineHeight,
    color: caption.color,
    textShadow: caption.shadow ? '0 2px 6px rgb(0 0 0 / 0.85)' : undefined,
    WebkitTextStroke: caption.outline ? `${caption.fontSize * 0.07}px rgb(0 0 0 / 0.92)` : undefined,
    paintOrder: caption.outline ? 'stroke fill' : undefined,
  }

  return (
    <>
      <div className="absolute inset-x-0 top-0 bottom-2 flex items-end justify-center">
        <div
          className={cn('max-w-full rounded-[10px] transition-opacity duration-200', visible ? 'opacity-100' : 'opacity-0')}
          style={{ background: hexToRgba(caption.bgColor, caption.bgOpacity), padding: `${pad}px ${Math.round(pad * 1.6)}px` }}
        >
          {/* Mostra só as últimas N linhas: o excesso transborda (e é cortado) por cima. */}
          <div className="flex flex-col justify-end overflow-hidden" style={{ maxHeight: caption.fontSize * caption.lineHeight * caption.maxLines }}>
            <p className="text-center [overflow-wrap:anywhere]" style={style}>
              {text}
            </p>
          </div>
        </div>
      </div>
      {editing && (
        <div className="font-sans">
          <div title="Arraste para mover" className="absolute inset-0 cursor-move rounded-[10px] border-2 border-dashed border-blue-500 bg-blue-500/7 [-webkit-app-region:drag]" />
          <span className="absolute top-1 left-2 rounded-md bg-slate-900/85 px-2 py-0.5 text-[11px] font-semibold text-slate-200">
            Legendas · arraste para mover, alças ajustam a largura
          </span>
          <WidthHandle side="left" />
          <WidthHandle side="right" />
        </div>
      )}
    </>
  )
}
