import type { ReactNode } from 'react'
import { useStore } from 'zustand'
import { StatusDot } from '@/components/workspace/StatusDot'
import { formatMs } from '@/lib/format'
import { cn } from '@/lib/utils'
import { systemStore } from '@/features/diagnostics/system-store'
import { outputStore } from '@/features/output/output-store'
import { SessionClock } from '@/features/session/SessionClock'
import { useAsrStatus, useVlibrasStatus } from '@/features/session/service-status'
import { sessionStore } from '@/features/session/session-store'
import { queue } from '@/features/session/session'

function Item({ children, title, className }: { children: ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={cn('flex h-full shrink-0 items-center gap-1.5 border-r border-line px-2.5 whitespace-nowrap last:border-r-0', className)}>
      {children}
    </span>
  )
}

const Muted = ({ children }: { children: ReactNode }) => <span className="text-fg-3">{children}</span>

// Barra de status fixa: só exibe o que os serviços realmente informam.
export function StatusBar() {
  const asr = useAsrStatus()
  const vlibras = useVlibrasStatus()
  const { metrics, app } = useStore(systemStore)
  const { lagMs, pending, active } = useStore(queue.store)
  const phase = useStore(sessionStore, (s) => s.phase)
  const outputs = useStore(outputStore, (s) => s.state)

  return (
    <footer className="flex h-6.5 shrink-0 items-center overflow-hidden border-t border-line bg-chrome font-mono text-[11px] text-fg-2" aria-label="Barra de status">
      <Item title={asr.label}>
        <StatusDot tone={asr.tone} />
        {asr.label}
      </Item>
      <Item title={vlibras.label}>
        <StatusDot tone={vlibras.tone} />
        {vlibras.label}
      </Item>
      <Item title="Atraso entre o fim da fala e o sinal em execução">
        <Muted>Atraso</Muted> {active ? formatMs(lagMs) : '—'}
      </Item>
      <Item>
        <Muted>Fila</Muted> {String(pending).padStart(2, '0')}
      </Item>
      {phase !== 'idle' && (
        <Item>
          <Muted>Sessão</Muted> <SessionClock />
        </Item>
      )}
      {outputs && (
        <Item>
          <Muted>Saídas</Muted>
          <span className={cn(outputs.presentationOpen && 'text-success')}>Telão {outputs.presentationOpen ? 'on' : 'off'}</span>
          <span className={cn(outputs.overlayActive && 'text-success')}>Overlay {outputs.overlayActive ? 'on' : 'off'}</span>
        </Item>
      )}

      {/* Abaixo de 1280 px as métricas de sistema saem da barra (seguem no módulo Diagnóstico). */}
      <div className="ml-auto flex h-full items-center">
        {metrics && (
          <>
            <Item title="CPU do sistema (processos do Sinalize entre parênteses)" className="max-xl:hidden">
              <Muted>CPU</Muted> {metrics.cpuPct ?? '—'}% <Muted>({metrics.appCpuPct}%)</Muted>
            </Item>
            <Item title="Memória usada pelo Sinalize" className="max-xl:hidden">
              <Muted>RAM</Muted> {(metrics.appRamMB / 1024).toFixed(1)} GB
            </Item>
            {metrics.gpu && (
              <Item title={metrics.gpu.name} className="max-xl:hidden">
                <Muted>GPU</Muted> {metrics.gpu.util}% <Muted>VRAM</Muted> {(metrics.gpu.usedMB / 1024).toFixed(1)}/{(metrics.gpu.totalMB / 1024).toFixed(1)} GB
              </Item>
            )}
          </>
        )}
        <Item title="Modelo de reconhecimento de voz" className="max-xl:hidden">
          {asr.model}
        </Item>
        {app && <Item className="text-fg-3">v{app.version}</Item>}
      </div>
    </footer>
  )
}
