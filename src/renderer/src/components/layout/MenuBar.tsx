import { useStore } from 'zustand'
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '@/components/ui/menubar'
import { appearanceStore } from '@/features/appearance/appearance-store'
import { actions } from '@/features/command/actions'
import { outputStore } from '@/features/output/output-store'
import { recorder } from '@/features/session/session'
import { DOCK_LABELS, DOCKS, WORKSPACE_PRESETS, workspace, workspaceStore } from '@/features/workspace/workspace-store'
import type { Engine } from '../../../../shared/output'

const trigger = 'h-6 rounded-sm px-2 text-xs font-normal text-fg-2 data-[state=open]:bg-hover data-[state=open]:text-fg'

export function MenuBar() {
  const { docks, preset } = useStore(workspaceStore)
  const theme = useStore(appearanceStore, (s) => s.theme)
  const { recording, paused } = useStore(recorder.store)
  const outputs = useStore(outputStore, (s) => s.state)
  const engine = outputs?.engine ?? 'studio'

  return (
    <Menubar className="h-7 shrink-0 gap-0 rounded-none border-0 border-b border-line bg-chrome px-1.5 py-0 shadow-none">
      <MenubarMenu>
        <MenubarTrigger className={trigger}>Arquivo</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={actions.exportTranscript}>Exportar transcrição (.txt)</MenubarItem>
          <MenubarSub>
            <MenubarSubTrigger>Exportar diagnóstico</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem onSelect={actions.exportDiagnosticsJson}>JSON completo</MenubarItem>
              <MenubarItem onSelect={actions.exportDiagnosticsCsv}>CSV por segmento</MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem onSelect={actions.quit}>
            Sair <MenubarShortcut>Alt+F4</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className={trigger}>Editar</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={actions.copyTranscript}>Copiar transcrição</MenubarItem>
          <MenubarItem onSelect={actions.clearTranscript}>Limpar transcrição e legenda</MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={actions.flushQueue}>Esvaziar fila de sinalização</MenubarItem>
          <MenubarItem onSelect={actions.clearFinished}>Remover itens concluídos da fila</MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={() => actions.openModule('glossary')}>Glossário e léxico</MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className={trigger}>Exibir</MenubarTrigger>
        <MenubarContent className="min-w-56">
          {DOCKS.map((dock) => (
            <MenubarCheckboxItem key={dock} checked={docks[dock]} onCheckedChange={() => workspace.toggleDock(dock)}>
              {DOCK_LABELS[dock]}
            </MenubarCheckboxItem>
          ))}
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>Workspace</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarRadioGroup value={preset} onValueChange={workspace.applyPreset}>
                {WORKSPACE_PRESETS.map((p) => (
                  <MenubarRadioItem key={p.id} value={p.id}>
                    {p.label}
                  </MenubarRadioItem>
                ))}
              </MenubarRadioGroup>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarItem onSelect={() => workspace.applyPreset(preset)}>Restaurar layout do workspace</MenubarItem>
          <MenubarSeparator />
          <MenubarCheckboxItem checked={theme === 'dark'} onCheckedChange={actions.toggleTheme}>
            Tema escuro
          </MenubarCheckboxItem>
          <MenubarItem onSelect={actions.monitorFullscreen}>
            Monitor em tela cheia <MenubarShortcut>F11</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={actions.openPalette}>
            Paleta de comandos <MenubarShortcut>Ctrl+K</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className={trigger}>Sessão</MenubarTrigger>
        <MenubarContent className="min-w-56">
          {recording ? (
            <MenubarItem onSelect={actions.stopSession} className="text-danger">
              Encerrar sessão <MenubarShortcut>Ctrl+Shift+Enter</MenubarShortcut>
            </MenubarItem>
          ) : (
            <MenubarItem onSelect={actions.startSession}>
              Iniciar sessão <MenubarShortcut>Ctrl+Shift+Enter</MenubarShortcut>
            </MenubarItem>
          )}
          <MenubarItem disabled={!recording} onSelect={actions.togglePause}>
            {paused ? 'Retomar captura' : 'Pausar captura'} <MenubarShortcut>Ctrl+Shift+P</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarRadioGroup value={engine} onValueChange={(v) => actions.setEngine(v as Engine)}>
            <MenubarRadioItem value="studio">Avatar no monitor do Studio</MenubarRadioItem>
            <MenubarRadioItem value="presentation">Avatar no Telão</MenubarRadioItem>
            <MenubarRadioItem value="overlay">Avatar no Overlay</MenubarRadioItem>
          </MenubarRadioGroup>
          <MenubarSeparator />
          <MenubarCheckboxItem checked={!!outputs?.overlayActive} onCheckedChange={actions.toggleOverlay}>
            Overlay ativo
          </MenubarCheckboxItem>
          <MenubarItem disabled={!outputs?.overlayActive} onSelect={actions.toggleOverlayEdit}>
            {outputs?.overlayActive && !outputs.editing ? 'Editar posições do overlay' : 'Bloquear overlay e apresentar'}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className={trigger}>Ferramentas</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={() => actions.openModule('diagnostics')}>
            Diagnóstico <MenubarShortcut>Ctrl+Shift+D</MenubarShortcut>
          </MenubarItem>
          <MenubarItem onSelect={() => actions.openModule('outputs')}>Overlay e Telão</MenubarItem>
          <MenubarItem onSelect={() => actions.openModule('audio')}>Áudio</MenubarItem>
          <MenubarSeparator />
          <MenubarItem onSelect={() => actions.openSettings()}>
            Configurações <MenubarShortcut>Ctrl+,</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className={trigger}>Ajuda</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onSelect={() => actions.openSettings('shortcuts')}>Atalhos de teclado</MenubarItem>
          <MenubarItem onSelect={() => workspace.setAboutOpen(true)}>Sobre o Sinalize Studio</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}
