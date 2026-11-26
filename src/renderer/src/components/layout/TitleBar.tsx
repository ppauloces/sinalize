import { Command, Settings } from 'lucide-react'
import { useStore } from 'zustand'
import { Button } from '@/components/ui/button'
import { StatusDot } from '@/components/workspace/StatusDot'
import { SessionClock } from '@/features/session/SessionClock'
import { useAsrStatus } from '@/features/session/service-status'
import { sessionStore } from '@/features/session/session-store'
import { workspace } from '@/features/workspace/workspace-store'

// Barra de título própria (arrastável); os botões nativos do Windows ficam sobrepostos à direita.
export function TitleBar() {
  const phase = useStore(sessionStore, (s) => s.phase)
  const asr = useAsrStatus()

  return (
    <header className="drag-region flex h-9 shrink-0 items-center gap-3 border-b border-line bg-chrome pr-[148px] pl-3">
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 16 16" className="size-4 text-brand" aria-hidden>
          <rect x="1" y="1" width="14" height="14" rx="3" fill="currentColor" />
          <path d="M5 11V6.5a1 1 0 0 1 2 0V9m0-3.5V5a1 1 0 0 1 2 0v4m0-3a1 1 0 0 1 2 0v3.5a3 3 0 0 1-3 3H7.6a2 2 0 0 1-1.5-.7L4.6 9.9" fill="none" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[11px] font-semibold tracking-[0.14em] text-fg">SINALIZE STUDIO</span>
      </div>

      <div className="flex items-center gap-1.5 text-[11px] text-fg-2" title={`Reconhecimento de voz: ${asr.label}`}>
        <StatusDot tone={asr.tone} />
        {asr.tone === 'ok' ? 'Online' : asr.label}
      </div>

      {phase !== 'idle' && (
        <div className="flex items-center gap-1.5 rounded-sm bg-danger-soft px-1.5 py-0.5 text-[11px] font-semibold text-danger">
          <StatusDot tone={phase === 'live' ? 'live' : 'warn'} />
          {phase === 'live' ? 'AO VIVO' : 'PAUSADO'}
          <SessionClock className="font-medium text-fg" />
        </div>
      )}

      <div className="no-drag ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" className="text-fg-3" onClick={() => workspace.setPaletteOpen(true)} title="Paleta de comandos (Ctrl+K)">
          <Command />
          <span className="font-mono text-[10px]">Ctrl K</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => workspace.openSettings()} title="Configurações (Ctrl+,)">
          <Settings />
          Configurações
        </Button>
      </div>
    </header>
  )
}
