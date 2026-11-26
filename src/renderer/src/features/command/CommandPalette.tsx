import { useStore } from 'zustand'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from '@/components/ui/command'
import { MODULE_INFO } from '@/components/layout/Sidebar'
import { outputStore } from '../output/output-store'
import { recorder, send } from '../session/session'
import { phrasesStore } from '../translation/quick-phrases'
import { WORKSPACE_PRESETS, workspace, workspaceStore, type ModuleId } from '../workspace/workspace-store'
import { actions } from './actions'

export function CommandPalette() {
  const open = useStore(workspaceStore, (s) => s.paletteOpen)
  const recording = useStore(recorder.store, (s) => s.recording)
  const outputs = useStore(outputStore, (s) => s.state)
  const phrases = useStore(phrasesStore, (s) => s.phrases)

  // Executa a ação depois de fechar a paleta (o foco volta para o workspace).
  const run = (fn: () => void) => () => {
    workspace.setPaletteOpen(false)
    requestAnimationFrame(fn)
  }

  return (
    <CommandDialog open={open} onOpenChange={workspace.setPaletteOpen} title="Paleta de comandos" description="Busque ações do Sinalize Studio">
      <CommandInput placeholder="Buscar ação, módulo ou frase…" />
      <CommandList>
        <CommandEmpty>Nenhuma ação encontrada.</CommandEmpty>
        <CommandGroup heading="Sessão">
          {recording ? (
            <CommandItem onSelect={run(actions.stopSession)}>
              Encerrar sessão <CommandShortcut>Ctrl+Shift+Enter</CommandShortcut>
            </CommandItem>
          ) : (
            <CommandItem onSelect={run(actions.startSession)}>
              Iniciar sessão <CommandShortcut>Ctrl+Shift+Enter</CommandShortcut>
            </CommandItem>
          )}
          {recording && <CommandItem onSelect={run(actions.togglePause)}>Pausar ou retomar captura</CommandItem>}
          <CommandItem onSelect={run(actions.skipSign)}>Pular segmento em sinalização</CommandItem>
          <CommandItem onSelect={run(actions.flushQueue)}>Esvaziar fila de sinalização</CommandItem>
        </CommandGroup>
        <CommandGroup heading="Saídas">
          <CommandItem onSelect={run(actions.togglePresentation)}>{outputs?.presentationOpen ? 'Fechar Telão' : 'Abrir Telão'}</CommandItem>
          <CommandItem onSelect={run(actions.toggleOverlay)}>{outputs?.overlayActive ? 'Fechar Overlay' : 'Abrir Overlay'}</CommandItem>
          {outputs?.overlayActive && <CommandItem onSelect={run(actions.toggleOverlayEdit)}>{outputs.editing ? 'Bloquear overlay e apresentar' : 'Editar posições do overlay'}</CommandItem>}
          <CommandItem onSelect={run(() => actions.setEngine('studio'))}>Trazer o avatar para o monitor do Studio</CommandItem>
        </CommandGroup>
        <CommandGroup heading="Módulos">
          {(Object.keys(MODULE_INFO) as ModuleId[]).map((id) => (
            <CommandItem key={id} onSelect={run(() => actions.openModule(id))}>
              Ir para {MODULE_INFO[id].label}
            </CommandItem>
          ))}
          <CommandItem onSelect={run(() => actions.openSettings())}>
            Configurações <CommandShortcut>Ctrl+,</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Frases rápidas">
          {phrases.map((p, i) => (
            <CommandItem key={p + i} value={`frase ${p}`} onSelect={run(() => send(p, undefined, undefined, 'frase'))}>
              Sinalizar “{p}” <CommandShortcut>{i + 1}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Exibir">
          {WORKSPACE_PRESETS.map((p) => (
            <CommandItem key={p.id} value={`workspace ${p.label}`} onSelect={run(() => workspace.applyPreset(p.id))}>
              Workspace: {p.label}
            </CommandItem>
          ))}
          <CommandItem onSelect={run(actions.toggleTheme)}>Alternar tema claro/escuro</CommandItem>
          <CommandItem onSelect={run(actions.monitorFullscreen)}>
            Monitor em tela cheia <CommandShortcut>F11</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Arquivo">
          <CommandItem onSelect={run(actions.exportTranscript)}>Exportar transcrição (.txt)</CommandItem>
          <CommandItem onSelect={run(actions.copyTranscript)}>Copiar transcrição</CommandItem>
          <CommandItem onSelect={run(actions.exportDiagnosticsJson)}>Exportar diagnóstico (JSON)</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
