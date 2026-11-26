import { useEffect, type ReactNode } from 'react'
import { LayoutPanelLeft } from 'lucide-react'
import { Group, Panel, useDefaultLayout, useGroupRef, type Layout } from 'react-resizable-panels'
import { useStore } from 'zustand'
import { EmptyState } from '@/components/workspace/Dock'
import { DockPanel } from '@/components/workspace/DockPanel'
import { ResizeHandle } from '@/components/workspace/ResizeHandle'
import { AudioModule } from '@/features/audio/AudioModule'
import { MixerDock } from '@/features/audio/Mixer'
import { Monitor } from '@/features/avatar/Monitor'
import { DiagnosticsModule } from '@/features/diagnostics/DiagnosticsModule'
import { GlossaryModule } from '@/features/glossary/GlossaryModule'
import { HistoryModule } from '@/features/history/HistoryModule'
import { OutputsModule } from '@/features/output/OutputsModule'
import { SessionDock } from '@/features/session/SessionDock'
import { TranscriptConsole } from '@/features/transcription/TranscriptConsole'
import { TranscriptsModule } from '@/features/transcription/TranscriptsModule'
import { ManualDock } from '@/features/translation/ManualDock'
import { QueueDock } from '@/features/translation/QueueDock'
import { MODULE_SPLIT, presetById, workspaceStore, type DockId, type ModuleId } from '@/features/workspace/workspace-store'

const SIDE_DOCKS: { id: DockId; render: () => ReactNode; minSize: number; maxSize?: number }[] = [
  // O controle de sessão tem conteúdo fixo: em telas altas o espaço extra vai para a fila.
  { id: 'session', render: () => <SessionDock />, minSize: 150, maxSize: 200 },
  { id: 'mixer', render: () => <MixerDock />, minSize: 150 },
  { id: 'queue', render: () => <QueueDock />, minSize: 140 },
  { id: 'manual', render: () => <ManualDock />, minSize: 150 },
]

const MODULES: Record<Exclude<ModuleId, 'studio'>, () => ReactNode> = {
  audio: () => <AudioModule />,
  transcripts: () => <TranscriptsModule />,
  glossary: () => <GlossaryModule />,
  history: () => <HistoryModule />,
  outputs: () => <OutputsModule />,
  diagnostics: () => <DiagnosticsModule />,
}

// Só os painéis visíveis entram no layout aplicado (normalizado para 100%).
function fit(layout: Layout, ids: string[]): Layout {
  const entries = ids.map((id) => [id, layout[id] ?? 100 / ids.length] as const)
  const total = entries.reduce((n, [, v]) => n + v, 0) || 1
  return Object.fromEntries(entries.map(([id, v]) => [id, (v / total) * 100]))
}

const storage = typeof localStorage === 'undefined' ? undefined : localStorage

export function StudioWorkspace() {
  const { module, docks, revision, preset } = useStore(workspaceStore)
  const layouts = presetById(preset).layouts
  const sideIds = SIDE_DOCKS.filter((d) => docks[d.id]).map((d) => d.id)
  const programIds = docks.transcript ? ['monitor', 'transcript'] : ['monitor']
  const mainMode = module === 'studio' ? 'studio' : 'module'

  const mainRef = useGroupRef()
  const programRef = useGroupRef()
  const sideRef = useGroupRef()
  const main = useDefaultLayout({ id: `sinalize-main-${mainMode}`, storage })
  const program = useDefaultLayout({ id: 'sinalize-program', storage, panelIds: programIds })
  const side = useDefaultLayout({ id: 'sinalize-side', storage, panelIds: sideIds })

  // Cada modo (Studio × módulos) guarda a própria proporção monitor/painel lateral.
  useEffect(() => {
    mainRef.current?.setLayout(main.defaultLayout ?? (mainMode === 'studio' ? layouts.main : MODULE_SPLIT))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reaplica só na troca de modo
  }, [mainMode])

  // Preset aplicado pelo menu Exibir ou pela paleta: impõe os tamanhos definidos.
  useEffect(() => {
    if (!revision) return
    mainRef.current?.setLayout(module === 'studio' ? layouts.main : MODULE_SPLIT)
    programRef.current?.setLayout(fit(layouts.program, programIds))
    sideRef.current?.setLayout(fit(layouts.side, sideIds))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reaplica só quando um preset é escolhido
  }, [revision])

  return (
    <Group id="sinalize-main" orientation="horizontal" groupRef={mainRef} defaultLayout={main.defaultLayout ?? layouts.main} onLayoutChanged={main.onLayoutChanged} className="min-h-0 flex-1">
      <Panel id="program" minSize={420} className="min-w-0">
        <Group
          id="sinalize-program"
          orientation="vertical"
          groupRef={programRef}
          defaultLayout={program.defaultLayout ?? fit(layouts.program, programIds)}
          onLayoutChanged={program.onLayoutChanged}
        >
          {/* Mantém o player ativo durante a troca de módulo e de workspace. */}
          <Panel id="monitor" minSize={260}>
            <Monitor />
          </Panel>
          {docks.transcript && (
            <>
              <ResizeHandle />
              <DockPanel id="transcript" minSize={110}>
                <TranscriptConsole />
              </DockPanel>
            </>
          )}
        </Group>
      </Panel>
      <ResizeHandle />
      <Panel id="side" minSize={280} className="min-w-0">
        {module !== 'studio' ? (
          MODULES[module]()
        ) : sideIds.length ? (
          <Group id="sinalize-side" orientation="vertical" groupRef={sideRef} defaultLayout={side.defaultLayout ?? fit(layouts.side, sideIds)} onLayoutChanged={side.onLayoutChanged}>
            {SIDE_DOCKS.filter((d) => docks[d.id]).map((d, i) => (
              <DockFragment key={d.id} first={i === 0} id={d.id} minSize={d.minSize} maxSize={d.maxSize}>
                {d.render()}
              </DockFragment>
            ))}
          </Group>
        ) : (
          <div className="h-full bg-panel">
            <EmptyState icon={LayoutPanelLeft} title="Nenhum dock visível">
              Ative os painéis pelo menu Exibir ou escolha um workspace.
            </EmptyState>
          </div>
        )}
      </Panel>
    </Group>
  )
}

function DockFragment({ id, first, minSize, maxSize, children }: { id: string; first: boolean; minSize: number; maxSize?: number; children: ReactNode }) {
  return (
    <>
      {!first && <ResizeHandle />}
      <DockPanel id={id} minSize={minSize} maxSize={maxSize}>
        {children}
      </DockPanel>
    </>
  )
}
