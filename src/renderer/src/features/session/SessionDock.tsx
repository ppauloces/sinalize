import { Pause, Play, Radio, Square } from 'lucide-react'
import { useStore } from 'zustand'
import type { Engine } from '../../../../shared/output'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Dock } from '@/components/workspace/Dock'
import { StatusDot } from '@/components/workspace/StatusDot'
import { actions } from '../command/actions'
import { outputStore } from '../output/output-store'
import { SessionClock } from './SessionClock'
import { useAsrStatus, useVlibrasStatus } from './service-status'
import { sessionStore } from './session-store'

const PHASE = { idle: 'Parada', live: 'Ao vivo', paused: 'Pausada' } as const

export function SessionDock() {
  const phase = useStore(sessionStore, (s) => s.phase)
  const engine = useStore(outputStore, (s) => s.state?.engine ?? 'studio')
  const asr = useAsrStatus()
  const vlibras = useVlibrasStatus()

  return (
    <Dock title="Controle de sessão" icon={Radio} bodyClassName="flex flex-col gap-2 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <SessionClock className="text-lg leading-none font-medium text-fg" />
        <span className="flex items-center gap-1.5 text-[11px] text-fg-2">
          <StatusDot tone={phase === 'live' ? 'live' : phase === 'paused' ? 'warn' : 'idle'} />
          {PHASE[phase]}
        </span>
        <div className="ml-auto flex gap-1">
          {phase === 'idle' ? (
            <Button variant="default" size="sm" onClick={actions.startSession}>
              <Play /> Iniciar sessão
            </Button>
          ) : (
            <>
              <Button size="sm" onClick={actions.togglePause} title={phase === 'paused' ? 'Retomar captura' : 'Pausar captura (o microfone continua aberto)'}>
                {phase === 'paused' ? <Play /> : <Pause />}
                {phase === 'paused' ? 'Retomar' : 'Pausar'}
              </Button>
              <Button size="sm" variant="destructive-outline" onClick={actions.stopSession}>
                <Square /> Encerrar
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-3 border-y border-line/70 py-1 text-[11px] text-fg-2">
        <span className="flex min-w-0 items-center gap-1.5" title={`Reconhecimento de voz: ${asr.label}`}>
          <StatusDot tone={asr.tone} /> <span className="truncate">{asr.label}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5" title={vlibras.label}>
          <StatusDot tone={vlibras.tone} /> <span className="truncate">{vlibras.label}</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs text-fg-3">Saída</span>
        <ToggleGroup type="single" variant="outline" size="sm" value={engine} onValueChange={(v) => v && actions.setEngine(v as Engine)} className="flex-1" aria-label="Saída do avatar">
          <ToggleGroupItem value="studio" className="flex-1 text-[11px]">
            Studio
          </ToggleGroupItem>
          <ToggleGroupItem value="presentation" className="flex-1 text-[11px]">
            Telão
          </ToggleGroupItem>
          <ToggleGroupItem value="overlay" className="flex-1 text-[11px]">
            Overlay
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </Dock>
  )
}
