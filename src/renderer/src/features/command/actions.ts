// Ações do Studio, compartilhadas pelos menus, pela paleta de comandos e pelos atalhos de teclado.
import type { Engine } from '../../../../shared/output'
import { appearanceStore, setAppearance } from '../appearance/appearance-store'
import { notify } from '../notify'
import { outputCommand } from '../output/output-store'
import { captions, queue, stopSession, startSession, toggleSession, togglePause } from '../session/session'
import { copyTranscript, exportTranscript } from '../transcription/transcript-export'
import { transcript } from '../transcription/transcript-store'
import { workspace, type ModuleId } from '../workspace/workspace-store'

let monitorElement: HTMLElement | null = null
export const setMonitorElement = (el: HTMLElement | null) => {
  monitorElement = el
}

async function exportDiagnostics(format: 'json' | 'csv') {
  const file = await window.sinalize.diag.export(format)
  if (file) notify.success('Diagnóstico exportado', file)
}

export const actions = {
  startSession: () => void startSession(),
  stopSession,
  startOrStop: toggleSession,
  togglePause,
  setEngine: (engine: Engine) => void outputCommand('setEngine', engine),
  toggleOverlay: () => void outputCommand('toggleOverlay'),
  togglePresentation: () => void outputCommand('togglePresentation'),
  toggleOverlayEdit: () => void outputCommand('toggleEdit'),

  exportTranscript,
  copyTranscript: () =>
    copyTranscript().then(
      () => notify.success('Transcrição copiada'),
      (e) => notify.error('Falha ao copiar', String(e?.message ?? e)),
    ),
  clearTranscript: () => {
    transcript.clear()
    captions.clear()
  },
  exportDiagnosticsJson: () => void exportDiagnostics('json'),
  exportDiagnosticsCsv: () => void exportDiagnostics('csv'),

  flushQueue: () => queue.flush(),
  clearFinished: () => queue.clearFinished(),
  skipSign: () => queue.skipCurrent(),

  openModule: (module: ModuleId) => workspace.setModule(module),
  openSettings: (category?: string) => workspace.openSettings(category),
  openPalette: () => workspace.setPaletteOpen(true),
  toggleTheme: () => setAppearance({ theme: appearanceStore.getState().theme === 'dark' ? 'light' : 'dark' }),
  monitorFullscreen: () => void monitorElement?.requestFullscreen().catch(() => notify.error('Tela cheia indisponível')),
  quit: () => window.close(),
}
