import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { recorder } from '../session/session'
import { METER_FLOOR_DB, dbToRatio, formatDb, measure } from './meter'

const PEAK_HOLD_MS = 1500
const PEAK_DECAY_DB_PER_S = 20
const SEGMENT = 3 // px por LED + 1 px de espaço
const SCALE = [-60, -50, -40, -30, -20, -10, -5, 0]

// Cores do tema lidas no máximo 1×/s (a troca de tema reflete no medidor sem custo por frame).
let paletteCache = { at: 0, colors: {} as Record<string, string> }
function color(name: string) {
  const now = performance.now()
  if (now - paletteCache.at > 1000) paletteCache = { at: now, colors: {} }
  return (paletteCache.colors[name] ??= getComputedStyle(document.documentElement).getPropertyValue(name).trim())
}

// Canvas nítido em qualquer escala de tela; redimensiona com o contêiner.
function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawRef = useRef(draw)
  useEffect(() => {
    drawRef.current = draw
  })
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let raf = 0
    let size = { w: 0, h: 0 }
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const dpr = window.devicePixelRatio || 1
      size = { w: entry.contentRect.width, h: entry.contentRect.height }
      canvas.width = Math.round(size.w * dpr)
      canvas.height = Math.round(size.h * dpr)
      canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0)
    })
    observer.observe(canvas)
    // Atualiza o medidor sem renderizar o workspace.
    const loop = () => {
      const ctx = canvas.getContext('2d')
      if (ctx && size.w) drawRef.current(ctx, size.w, size.h)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [])
  return ref
}

export function LevelMeter({ className, height = 12, status }: { className?: string; height?: number; status?: ReactNode }) {
  const buffer = useRef<Float32Array<ArrayBuffer> | null>(null)
  const hold = useRef({ db: METER_FLOOR_DB, at: 0 })
  const readout = useRef<HTMLSpanElement>(null)
  const peakReadout = useRef<HTMLSpanElement>(null)
  const lastText = useRef(0)
  const [clipped, setClipped] = useState(false)

  const canvas = useCanvas((ctx, w, h) => {
    const analyser = recorder.meterAnalyser
    let rmsDb = METER_FLOOR_DB
    let peakDb = METER_FLOOR_DB
    if (analyser) {
      if (buffer.current?.length !== analyser.fftSize) buffer.current = new Float32Array(analyser.fftSize)
      analyser.getFloatTimeDomainData(buffer.current)
      const m = measure(buffer.current)
      rmsDb = m.rmsDb
      peakDb = m.peakDb
      if (m.clipped) setClipped(true)
    }
    const now = performance.now()
    const held = hold.current
    if (peakDb >= held.db) hold.current = { db: peakDb, at: now }
    else if (now - held.at > PEAK_HOLD_MS) held.db = Math.max(METER_FLOOR_DB, held.db - (PEAK_DECAY_DB_PER_S * 16) / 1000)

    ctx.clearRect(0, 0, w, h)
    const zones = { low: color('--meter-low'), mid: color('--meter-mid'), high: color('--meter-high'), track: color('--meter-track') }
    const segments = Math.floor(w / SEGMENT)
    const litRms = Math.round(dbToRatio(rmsDb) * segments)
    const litPeak = Math.round(dbToRatio(peakDb) * segments)
    for (let i = 0; i < segments; i++) {
      const db = METER_FLOOR_DB + (i / segments) * -METER_FLOOR_DB
      const zone = db >= -9 ? zones.high : db >= -20 ? zones.mid : zones.low
      ctx.globalAlpha = i < litRms ? 1 : i < litPeak ? 0.45 : 1
      ctx.fillStyle = i < litPeak ? zone : zones.track
      ctx.fillRect(i * SEGMENT, 0, SEGMENT - 1, h)
    }
    ctx.globalAlpha = 1
    const holdX = dbToRatio(hold.current.db) * w
    if (hold.current.db > METER_FLOOR_DB) {
      ctx.fillStyle = color('--fg')
      ctx.fillRect(Math.min(w - 2, holdX), 0, 2, h)
    }
    // Leitura numérica a ~8 Hz, direto no DOM.
    if (now - lastText.current > 120) {
      lastText.current = now
      if (readout.current) readout.current.textContent = formatDb(rmsDb)
      if (peakReadout.current) peakReadout.current.textContent = formatDb(hold.current.db)
    }
  })

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center gap-2">
        <canvas ref={canvas} className="min-w-0 flex-1 rounded-xs" style={{ height }} aria-label="Medidor de nível do microfone" role="img" />
        <button
          type="button"
          onClick={() => setClipped(false)}
          title={clipped ? 'Clipping detectado — clique para limpar' : 'Sem clipping'}
          className={cn('h-4 shrink-0 rounded-xs px-1 font-mono text-[9px] font-bold tracking-wide', clipped ? 'bg-danger-strong text-white' : 'bg-elevated text-fg-3')}
        >
          CLIP
        </button>
      </div>
      <div className="relative h-3 pr-10 font-mono text-[9px] text-fg-3" aria-hidden>
        {SCALE.map((db) => (
          <span key={db} className="absolute -translate-x-1/2 last:-translate-x-full" style={{ left: `calc(${dbToRatio(db) * 100}% - ${dbToRatio(db) * 40}px)` }}>
            {db}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3 font-mono text-[11px] text-fg-2">
        <span>
          RMS <span ref={readout} className="text-fg tabular">−∞</span> dB
        </span>
        <span>
          Pico <span ref={peakReadout} className="text-fg tabular">−∞</span> dB
        </span>
        {status && <span className="ml-auto min-w-0 truncate font-sans">{status}</span>}
      </div>
    </div>
  )
}

// Histórico de amplitude dos últimos segundos (dados reais do microfone).
export function Waveform({ className }: { className?: string }) {
  const buffer = useRef<Float32Array<ArrayBuffer> | null>(null)
  const history = useRef<number[]>([])
  const canvas = useCanvas((ctx, w, h) => {
    const analyser = recorder.meterAnalyser
    let peak = 0
    if (analyser) {
      if (buffer.current?.length !== analyser.fftSize) buffer.current = new Float32Array(analyser.fftSize)
      analyser.getFloatTimeDomainData(buffer.current)
      peak = measure(buffer.current).peak
    }
    const hist = history.current
    // Sem captura não há histórico: fica só a linha de base.
    if (!analyser) hist.length = 0
    else hist.push(peak)
    if (hist.length > w) hist.splice(0, hist.length - Math.floor(w))
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = color('--line')
    ctx.fillRect(0, h / 2, w, 1)
    ctx.fillStyle = color('--accent-base')
    const offset = w - hist.length
    for (let i = 0; i < hist.length; i++) {
      const amp = Math.max(1, hist[i]! * (h - 2))
      ctx.fillRect(offset + i, (h - amp) / 2, 1, amp)
    }
  })
  return <canvas ref={canvas} className={cn('w-full', className)} role="img" aria-label="Forma de onda do microfone" />
}
