import { useEffect } from 'react'
import { useStore } from 'zustand'
import { MenuBar } from '@/components/layout/MenuBar'
import { Sidebar } from '@/components/layout/Sidebar'
import { StatusBar } from '@/components/layout/StatusBar'
import { TitleBar } from '@/components/layout/TitleBar'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Toaster } from '@/components/ui/sonner'
import { CommandPalette } from '@/features/command/CommandPalette'
import { systemStore } from '@/features/diagnostics/system-store'
import { startStudio } from '@/features/session/session'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { workspace, workspaceStore } from '@/features/workspace/workspace-store'
import { bindStudioShortcuts } from './keyboard'
import { StudioWorkspace } from './StudioWorkspace'

function AboutDialog() {
  const open = useStore(workspaceStore, (s) => s.aboutOpen)
  const app = useStore(systemStore, (s) => s.app)
  return (
    <Dialog open={open} onOpenChange={workspace.setAboutOpen}>
      <DialogContent className="w-[420px] rounded-lg border-line bg-panel p-5">
        <DialogTitle className="text-sm font-semibold">Sinalize Studio</DialogTitle>
        <DialogDescription className="text-xs leading-relaxed text-fg-2">
          Estação de acessibilidade em tempo real: fala em português transcrita, traduzida para Libras pelo VLibras e exibida no monitor, no Telão e no Overlay.
        </DialogDescription>
        {app && (
          <p className="font-mono text-[11px] text-fg-3">
            Versão {app.version} · Electron {app.electron} · {app.platform}
          </p>
        )}
        <p className="text-[11px] text-fg-3">VLibras é software livre do Governo Federal (LGPLv3). O Sinalize não substitui intérprete humano em contextos formais.</p>
      </DialogContent>
    </Dialog>
  )
}

export function StudioApp() {
  useEffect(() => startStudio(), [])
  useEffect(() => bindStudioShortcuts(), [])
  // "Configurar avatar/legendas" na barra do overlay abre o módulo de saídas.
  useEffect(() => window.sinalize.output.onFocus(() => workspace.setModule('outputs')), [])

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <MenuBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <StudioWorkspace />
      </div>
      <StatusBar />
      <SettingsDialog />
      <CommandPalette />
      <AboutDialog />
      <Toaster position="bottom-right" offset={{ bottom: 36, right: 12 }} />
    </div>
  )
}
