import { createContext, useContext, useState, type ReactNode } from 'react'
import { Panel, usePanelRef } from 'react-resizable-panels'

export const DOCK_HEADER_PX = 32

interface DockCollapse {
  collapsed: boolean
  toggle: () => void
}

const DockPanelContext = createContext<DockCollapse | null>(null)

export const useDockCollapse = () => useContext(DockPanelContext)

// Painel de dock recolhível: recolhido, mostra só o cabeçalho de 32 px.
export function DockPanel({ id, minSize = 96, maxSize, children }: { id: string; minSize?: number; maxSize?: number; children: ReactNode }) {
  const ref = usePanelRef()
  const [collapsed, setCollapsed] = useState(false)
  const toggle = () => (ref.current?.isCollapsed() ? ref.current.expand() : ref.current?.collapse())
  return (
    <Panel
      id={id}
      panelRef={ref}
      collapsible
      collapsedSize={DOCK_HEADER_PX}
      minSize={minSize}
      maxSize={maxSize}
      onResize={(size) => setCollapsed(size.inPixels <= DOCK_HEADER_PX + 1)}
      className="min-h-0"
    >
      <DockPanelContext.Provider value={{ collapsed, toggle }}>{children}</DockPanelContext.Provider>
    </Panel>
  )
}
