// Workspace do Studio: módulo ativo, docks visíveis e presets de layout.
import { createStore } from 'zustand/vanilla'
import { persist } from 'zustand/middleware'

export const MODULES = ['studio', 'audio', 'transcripts', 'glossary', 'history', 'outputs', 'diagnostics'] as const
export type ModuleId = (typeof MODULES)[number]

export const DOCKS = ['session', 'mixer', 'queue', 'manual', 'transcript'] as const
export type DockId = (typeof DOCKS)[number]

export const DOCK_LABELS: Record<DockId, string> = {
  session: 'Controle de sessão',
  mixer: 'Mixer de áudio',
  queue: 'Fila de sinalização',
  manual: 'Tradução manual',
  transcript: 'Transcrição em tempo real',
}

export type Layout = Record<string, number>

export interface WorkspacePreset {
  id: string
  label: string
  docks: Record<DockId, boolean>
  // Tamanhos em % por grupo de painéis (ids em StudioWorkspace).
  layouts: { main: Layout; program: Layout; side: Layout }
}

const all = (on: Partial<Record<DockId, boolean>>): Record<DockId, boolean> => ({ session: false, mixer: false, queue: false, manual: false, transcript: false, ...on })

export const WORKSPACE_PRESETS: WorkspacePreset[] = [
  {
    id: 'default',
    label: 'Padrão',
    docks: all({ session: true, mixer: true, queue: true, manual: true, transcript: true }),
    layouts: { main: { program: 68, side: 32 }, program: { monitor: 74, transcript: 26 }, side: { session: 22, mixer: 24, queue: 27, manual: 27 } },
  },
  {
    id: 'live',
    label: 'Operação ao vivo',
    docks: all({ session: true, mixer: true, queue: true, transcript: true }),
    layouts: { main: { program: 70, side: 30 }, program: { monitor: 76, transcript: 24 }, side: { session: 22, mixer: 26, queue: 52 } },
  },
  {
    id: 'audio',
    label: 'Monitoramento de áudio',
    docks: all({ session: true, mixer: true, transcript: true }),
    layouts: { main: { program: 62, side: 38 }, program: { monitor: 66, transcript: 34 }, side: { session: 26, mixer: 74 } },
  },
  {
    id: 'transcription',
    label: 'Transcrição',
    docks: all({ session: true, queue: true, transcript: true }),
    layouts: { main: { program: 64, side: 36 }, program: { monitor: 50, transcript: 50 }, side: { session: 30, queue: 70 } },
  },
  {
    id: 'diagnostics',
    label: 'Diagnóstico',
    docks: all({ session: true, mixer: true, queue: true, transcript: true }),
    layouts: { main: { program: 58, side: 42 }, program: { monitor: 60, transcript: 40 }, side: { session: 20, mixer: 25, queue: 55 } },
  },
  {
    id: 'compact',
    label: 'Compacto',
    docks: all({ session: true, queue: true, manual: true }),
    layouts: { main: { program: 72, side: 28 }, program: { monitor: 100 }, side: { session: 26, queue: 44, manual: 30 } },
  },
]

// Proporção monitor × módulo fora do Studio: o avatar continua visível ao lado de cada módulo.
export const MODULE_SPLIT: Layout = { program: 46, side: 54 }

interface WorkspaceState {
  module: ModuleId
  docks: Record<DockId, boolean>
  preset: string
  // Incrementa quando um preset é aplicado: os grupos reaplicam os tamanhos.
  revision: number
  settingsOpen: boolean
  settingsCategory: string
  paletteOpen: boolean
  aboutOpen: boolean
}

export const workspaceStore = createStore<WorkspaceState>()(
  persist(
    (): WorkspaceState => ({
      module: 'studio',
      docks: WORKSPACE_PRESETS[0]!.docks,
      preset: 'default',
      revision: 0,
      settingsOpen: false,
      settingsCategory: 'general',
      paletteOpen: false,
      aboutOpen: false,
    }),
    {
      name: 'sinalize_workspace',
      partialize: ({ module, docks, preset }) => ({ module, docks, preset }),
    },
  ),
)

export const presetById = (id: string) => WORKSPACE_PRESETS.find((p) => p.id === id) ?? WORKSPACE_PRESETS[0]!

export const workspace = {
  setModule: (module: ModuleId) => workspaceStore.setState({ module }),
  toggleDock: (dock: DockId) => workspaceStore.setState((s) => ({ docks: { ...s.docks, [dock]: !s.docks[dock] }, module: 'studio' })),
  applyPreset: (id: string) => {
    const preset = presetById(id)
    workspaceStore.setState((s) => ({ preset: preset.id, docks: preset.docks, module: 'studio', revision: s.revision + 1 }))
  },
  openSettings: (category = 'general') => workspaceStore.setState({ settingsOpen: true, settingsCategory: category }),
  setSettingsOpen: (settingsOpen: boolean) => workspaceStore.setState({ settingsOpen }),
  setPaletteOpen: (paletteOpen: boolean) => workspaceStore.setState({ paletteOpen }),
  setAboutOpen: (aboutOpen: boolean) => workspaceStore.setState({ aboutOpen }),
}
