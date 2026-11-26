import type { ComponentType } from 'react'
import { Activity, AudioLines, BookA, History, MonitorPlay, PictureInPicture2, ScrollText, Settings } from 'lucide-react'
import { useStore } from 'zustand'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { workspace, workspaceStore, type ModuleId } from '@/features/workspace/workspace-store'

export const MODULE_INFO: Record<ModuleId, { label: string; icon: ComponentType<{ className?: string }> }> = {
  studio: { label: 'Studio', icon: MonitorPlay },
  audio: { label: 'Áudio', icon: AudioLines },
  transcripts: { label: 'Transcrições', icon: ScrollText },
  glossary: { label: 'Glossário e léxico', icon: BookA },
  history: { label: 'Histórico', icon: History },
  outputs: { label: 'Overlay e Telão', icon: PictureInPicture2 },
  diagnostics: { label: 'Diagnóstico', icon: Activity },
}

function SidebarButton({ label, icon: Icon, active, onClick }: { label: string; icon: ComponentType<{ className?: string }>; active?: boolean; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-current={active ? 'page' : undefined}
          onClick={onClick}
          className={cn(
            'relative flex size-9 items-center justify-center rounded-md text-fg-3 transition-colors outline-none hover:bg-hover hover:text-fg focus-visible:ring-1 focus-visible:ring-brand',
            active && 'bg-elevated text-fg before:absolute before:top-2 before:bottom-2 before:-left-1.5 before:w-0.5 before:rounded-full before:bg-brand',
          )}
        >
          <Icon className="size-4.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

// Trocar de módulo não desmonta o monitor: o player e a sessão continuam ativos.
export function Sidebar() {
  const current = useStore(workspaceStore, (s) => s.module)
  return (
    <nav aria-label="Módulos" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-line bg-chrome py-2">
      {(Object.keys(MODULE_INFO) as ModuleId[]).map((id) => (
        <SidebarButton key={id} label={MODULE_INFO[id].label} icon={MODULE_INFO[id].icon} active={current === id} onClick={() => workspace.setModule(id)} />
      ))}
      <div className="mt-auto" />
      <SidebarButton label="Configurações" icon={Settings} onClick={() => workspace.openSettings()} />
    </nav>
  )
}
