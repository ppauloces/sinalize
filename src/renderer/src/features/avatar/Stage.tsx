import { useState } from 'react'
import { Hand, Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/section'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { CaptionView } from '../captions/CaptionView'
import { overlayCommand, overlayStore } from '../overlay/overlay-store'
import { queue } from '../session/session'
import { setStageFrame } from './player'

// O src é fixado na montagem: trocar de personagem usa setAvatar sem recarregar o Unity.
function StageFrame({ character }: { character: string }) {
  const [src] = useState(() => `vlibras-stage.html?subtitles=1&avatar=${character}`)
  return <iframe ref={setStageFrame} src={src} title="Avatar VLibras" className="block size-full border-0 bg-transparent" />
}

function LagBadge() {
  const { lagMs, pending, active } = useStore(queue.store)
  if (!active || (lagMs < 1500 && pending === 0)) return null
  return (
    <span
      className={cn(
        'rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold tabular-nums',
        lagMs > 8000 ? 'border-danger-border bg-danger-soft text-danger'
          : lagMs > 3000 ? 'border-warning-border bg-warning-soft text-warning'
          : 'bg-muted text-muted-foreground',
      )}
    >
      Atraso {(lagMs / 1000).toFixed(0)} s{pending ? ` · ${pending} na fila` : ''}
    </span>
  )
}

export function Stage({ theater, onTheater }: { theater: boolean; onTheater: (on: boolean) => void }) {
  const overlay = useStore(overlayStore)
  const inOverlay = overlay?.engine === 'overlay'

  return (
    <section className="relative flex min-w-0 flex-col overflow-hidden bg-[image:var(--stage)]" aria-label="Palco do Avatar VLibras">
      {theater && (
        <Button variant="outline" size="sm" className="absolute top-3 right-3 z-20 bg-card/90 backdrop-blur" onClick={() => onTheater(false)}>
          <Minimize2 />
          Voltar ao Modo Estúdio
          <Kbd>ESC</Kbd>
        </Button>
      )}

      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card/85 px-4 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-[image:var(--brand-gradient)] text-white">
            <Hand className="size-4" />
          </span>
          <span className="text-lg font-bold tracking-tight">Sinalize</span>
        </div>
        <div className={cn('flex items-center gap-2', theater && 'mr-52')}>
          <LagBadge />
          {!theater && (
            <Button variant="brand" size="sm" onClick={() => onTheater(true)} title="Expandir avatar e legenda para projeção">
              <Maximize2 />
              Modo Telão
            </Button>
          )}
        </div>
      </header>

      <main className={cn('relative flex min-h-0 flex-1 items-center justify-center', theater ? 'px-6 pt-3 pb-2.5' : 'px-3.5 pt-2.5 pb-2')}>
        {inOverlay ? (
          <div className="flex flex-col items-center gap-2.5 text-center text-sm text-muted-foreground">
            <span>O avatar está sinalizando no overlay flutuante.</span>
            <Button variant="outline" size="sm" onClick={() => void overlayCommand('toggleEdit')}>
              Editar posições do overlay
            </Button>
          </div>
        ) : (
          <StageFrame character={overlay?.settings.avatar.character ?? 'icaro'} />
        )}
      </main>

      <CaptionView theater={theater} />
    </section>
  )
}
