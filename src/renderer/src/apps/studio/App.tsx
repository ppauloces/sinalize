import { useEffect, useState } from 'react'
import { BookOpen, Mic, Moon, PanelsTopLeft, Settings, Sun } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Stage } from '@/features/avatar/Stage'
import { GlossaryTab } from '@/features/glossary/GlossaryTab'
import { glossaryStore } from '@/features/glossary/glossary'
import { OverlayTab } from '@/features/overlay/OverlayTab'
import { ControlTab, QUICK_PHRASES } from '@/features/session/ControlTab'
import { ServerPill, SettingsDrawer } from '@/features/session/SettingsDrawer'
import { send, startSession, uiStore } from '@/features/session/session'
import { statusStore } from '@/features/session/status'
import { applyTheme, savedTheme, type Theme } from './theme'

type Tab = 'control' | 'glossary' | 'overlay'

declare global {
  interface Window {
    // Chamado pelo palco (iframe) quando o ESC é pressionado com o foco nele.
    setTheaterMode?: (on: boolean) => void
  }
}

function StatusFooter() {
  const { message, tone } = useStore(statusStore)
  return (
    <footer
      className={cn(
        'shrink-0 px-1 pb-1 text-center text-[0.74rem] text-muted-foreground',
        tone === 'active' && 'font-medium text-accent-foreground',
        tone === 'error' && 'font-medium text-danger',
      )}
    >
      {message}
    </footer>
  )
}

function ControlColumn({ hidden }: { hidden: boolean }) {
  const [tab, setTab] = useState<Tab>('control')
  const [theme, setTheme] = useState<Theme>(savedTheme)
  const { settingsOpen } = useStore(uiStore)
  const glossaryCount = useStore(glossaryStore).length

  // Configurar avatar/legendas pela barra do overlay: abre a aba e rola até a seção.
  useEffect(
    () =>
      window.sinalize.overlay.onFocus((section) => {
        setTab('overlay')
        requestAnimationFrame(() => document.getElementById(`overlay-${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
      }),
    [],
  )

  return (
    <aside className={cn('flex h-screen min-w-0 flex-col overflow-hidden bg-background transition-opacity duration-200', hidden && 'pointer-events-none opacity-0')} aria-label="Painel de controle">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <div className="flex items-center justify-between gap-2">
          <ServerPill />
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="icon-sm"
              title={theme === 'dark' ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
              aria-pressed={theme === 'dark'}
              onClick={() => {
                const next = theme === 'dark' ? 'light' : 'dark'
                applyTheme(next)
                setTheme(next)
              }}
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
            <Button
              variant={settingsOpen ? 'secondary' : 'outline'}
              size="icon-sm"
              title="Configurações (transcrição e diagnóstico)"
              onClick={() => uiStore.set((u) => ({ ...u, settingsOpen: !u.settingsOpen }))}
            >
              <Settings />
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-3">
          <TabsList className="grid h-auto w-full grid-cols-3">
            <TabsTrigger value="control">
              <Mic />
              Controle
            </TabsTrigger>
            <TabsTrigger value="glossary">
              <BookOpen />
              Glossário
              <Badge variant="secondary" className="h-4 px-1.5 text-[0.65rem]">
                {glossaryCount}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="overlay">
              <PanelsTopLeft />
              Overlay
            </TabsTrigger>
          </TabsList>
          {settingsOpen && <SettingsDrawer />}
          <TabsContent value="control">
            <ControlTab />
          </TabsContent>
          <TabsContent value="glossary">
            <GlossaryTab />
          </TabsContent>
          <TabsContent value="overlay">
            <OverlayTab />
          </TabsContent>
        </Tabs>
        <div className="flex-1" />
        <StatusFooter />
      </div>
    </aside>
  )
}

export function App() {
  const [theater, setTheater] = useState(false)

  useEffect(() => startSession(), [])

  // ESC sai do Telão, Ctrl+Shift+D abre o diagnóstico e [1-6] envia frases prontas.
  useEffect(() => {
    window.setTheaterMode = setTheater
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return setTheater(false)
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        return window.sinalize.openDiagnostics()
      }
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, [role="combobox"], [role="slider"]') || e.ctrlKey || e.altKey || e.metaKey) return
      const phrase = QUICK_PHRASES[Number(e.key) - 1]
      if (phrase) {
        e.preventDefault()
        send(phrase)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      delete window.setTheaterMode
    }
  }, [])

  return (
    <div className={cn('grid h-screen w-screen overflow-hidden', theater ? 'grid-cols-[100%_0%]' : 'grid-cols-[55%_45%]')}>
      <Stage theater={theater} onTheater={setTheater} />
      <ControlColumn hidden={theater} />
    </div>
  )
}
