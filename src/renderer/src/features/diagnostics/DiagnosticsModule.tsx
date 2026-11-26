import { useEffect, useState, type ReactNode } from 'react'
import { Activity, Download, RotateCcw } from 'lucide-react'
import { useStore } from 'zustand'
import type { DiagnosticsSnapshot } from '../../../../shared/ipc'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/workspace/Dock'
import { ModuleFrame } from '@/components/workspace/ModuleFrame'
import { formatMs } from '@/lib/format'
import { cn } from '@/lib/utils'
import { actions } from '../command/actions'
import { systemStore } from './system-store'

const REFRESH_MS = 1000

function Tile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'warn' | 'error' }) {
  return (
    <div className="border-r border-b border-line px-3 py-2">
      <div className="text-[10px] tracking-wider text-fg-3 uppercase">{label}</div>
      <div className={cn('font-mono text-base text-fg tabular', tone === 'warn' && 'text-warning', tone === 'error' && 'text-danger')}>{value}</div>
      {sub && <div className="truncate font-mono text-[10px] text-fg-3">{sub}</div>}
    </div>
  )
}

export function DiagnosticsModule() {
  const [snap, setSnap] = useState<DiagnosticsSnapshot | null>(null)
  const metrics = useStore(systemStore, (s) => s.metrics)

  useEffect(() => {
    let alive = true
    const load = () => void window.sinalize.diag.snapshot().then((s) => alive && setSnap(s))
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const s = snap?.summary
  const p = (key: string) => s?.percentiles[key]

  return (
    <ModuleFrame
      title="Diagnóstico"
      description="Latências por etapa, fila e consumo de recursos (dados da telemetria desta sessão)"
      icon={Activity}
      actions={
        <>
          <Button size="sm" onClick={actions.exportDiagnosticsJson}>
            <Download /> JSON
          </Button>
          <Button size="sm" onClick={actions.exportDiagnosticsCsv}>
            <Download /> CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void window.sinalize.diag.reset()}>
            <RotateCcw /> Zerar
          </Button>
        </>
      }
    >
      {!s ? (
        <EmptyState icon={Activity} title="Carregando telemetria" />
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] border-t border-l border-line">
            <Tile label="Ponta a ponta P50" value={formatMs(p('e2eMs')?.p50)} sub={`P95 ${formatMs(p('e2eMs')?.p95)}`} />
            <Tile label="Transcrição final P50" value={formatMs(p('asrFinalMs')?.p50)} sub={`P95 ${formatMs(p('asrFinalMs')?.p95)}`} />
            <Tile label="Tradutor P50" value={formatMs(p('glossMs')?.p50)} sub={`P95 ${formatMs(p('glossMs')?.p95)}`} />
            <Tile label="Espera na fila P50" value={formatMs(p('queueWaitMs')?.p50)} sub={`P95 ${formatMs(p('queueWaitMs')?.p95)}`} />
            <Tile label="Atraso atual" value={formatMs(s.lag.current)} sub={`máx ${formatMs(s.lag.max)}`} tone={s.lag.current > 8000 ? 'error' : s.lag.current > 3000 ? 'warn' : undefined} />
            <Tile label="Segmentos" value={s.counts.segments} sub={`${s.counts.signed} sinalizados · ${s.counts.asrErrors} erros ASR`} />
            <Tile label="Loops do ASR" value={s.counts.asrLoops} sub="detectados e corrigidos" tone={s.counts.asrLoops ? 'warn' : undefined} />
            <Tile label="Descartados" value={s.counts.dropped} sub="só pelo operador" />
            <Tile label="Palavras/min" value={s.wpm ?? '—'} sub="últimos 60 s" />
            <Tile label="Velocidade" value={s.lag.speed ? `${s.lag.speed}x` : '—'} sub={`${s.counts.speedChanges} trocas adaptativas`} />
            {metrics && (
              <>
                <Tile label="CPU" value={`${metrics.cpuPct ?? '—'}%`} sub={`Sinalize ${metrics.appCpuPct}% de 1 núcleo`} />
                <Tile label="RAM do app" value={`${metrics.appRamMB} MB`} sub={`sistema ${(metrics.ramUsedMB / 1024).toFixed(1)}/${(metrics.ramTotalMB / 1024).toFixed(1)} GB`} />
                {metrics.gpu && <Tile label="GPU" value={`${metrics.gpu.util}%`} sub={`${metrics.gpu.name} · ${metrics.gpu.usedMB} MB`} />}
              </>
            )}
          </div>

          <h3 className="px-3 pt-4 pb-1.5 text-[11px] font-semibold tracking-[0.07em] text-fg-2 uppercase">Latência por etapa</h3>
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] tracking-wider text-fg-3 uppercase">
              <tr className="border-y border-line">
                <th className="px-3 py-1.5 font-medium">Etapa</th>
                {['n', 'P50', 'P95', 'P99'].map((h) => (
                  <th key={h} className="w-20 px-3 py-1.5 text-right font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono">
              {Object.entries(snap.metrics).map(([key, label]) => {
                const row = s.percentiles[key]
                return (
                  <tr key={key} className="border-b border-line/60">
                    <td className="px-3 py-1 font-sans text-fg-2">{label}</td>
                    <td className="px-3 py-1 text-right text-fg-3">{row?.n ?? 0}</td>
                    <td className="px-3 py-1 text-right">{formatMs(row?.p50)}</td>
                    <td className="px-3 py-1 text-right">{formatMs(row?.p95)}</td>
                    <td className="px-3 py-1 text-right">{formatMs(row?.p99)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <h3 className="px-3 pt-4 pb-1.5 text-[11px] font-semibold tracking-[0.07em] text-fg-2 uppercase">Segmentos recentes</h3>
          {!snap.segments.length ? (
            <p className="px-3 pb-4 text-xs text-fg-3">Nenhum segmento registrado.</p>
          ) : (
            <table className="mb-4 w-full text-xs">
              <thead className="text-left text-[10px] tracking-wider text-fg-3 uppercase">
                <tr className="border-y border-line">
                  <th className="px-3 py-1.5 font-medium">Segmento</th>
                  <th className="px-2 py-1.5 font-medium">Estado</th>
                  <th className="px-2 py-1.5 font-medium">Texto</th>
                  <th className="w-20 px-2 py-1.5 text-right font-medium">ASR</th>
                  <th className="w-20 px-2 py-1.5 text-right font-medium">Fila</th>
                  <th className="w-20 px-3 py-1.5 text-right font-medium">E2E</th>
                </tr>
              </thead>
              <tbody>
                {[...snap.segments].reverse().map((seg) => (
                  <tr key={seg.seg} className="border-b border-line/60">
                    <td className="px-3 py-1 font-mono text-[11px] text-fg-3">{seg.seg}</td>
                    <td className="px-2 py-1 text-[11px] text-fg-2">{seg.status}</td>
                    <td className="max-w-0 truncate px-2 py-1 text-fg" title={seg.text}>
                      {seg.text}
                    </td>
                    <td className="px-2 py-1 text-right font-mono text-[11px]">{formatMs(seg.asrFinalMs)}</td>
                    <td className="px-2 py-1 text-right font-mono text-[11px]">{formatMs(seg.queueWaitMs)}</td>
                    <td className="px-3 py-1 text-right font-mono text-[11px]">{formatMs(seg.e2eMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </ModuleFrame>
  )
}
