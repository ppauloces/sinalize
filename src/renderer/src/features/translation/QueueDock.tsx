import { useEffect, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, CircleDashed, ListOrdered, Loader, MoreHorizontal, Redo2, SkipForward, Trash2, X } from 'lucide-react'
import { useStore } from 'zustand'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dock, EmptyState } from '@/components/workspace/Dock'
import { formatMs } from '@/lib/format'
import { nowMs } from '@/lib/telemetry'
import { cn } from '@/lib/utils'
import { queue } from '../session/session'
import type { QueueItem, QueueItemState } from './signing-queue'

const STATE: Record<QueueItemState, { label: string; icon: typeof CircleCheck; className: string }> = {
  playing: { label: 'Sinalizando', icon: Loader, className: 'text-brand-fg' },
  waiting: { label: 'Aguardando', icon: CircleDashed, className: 'text-fg-3' },
  done: { label: 'Concluído', icon: CircleCheck, className: 'text-success' },
  skipped: { label: 'Pulado', icon: SkipForward, className: 'text-fg-3' },
  failed: { label: 'Sem animação', icon: CircleAlert, className: 'text-danger' },
}

// Re-renderiza a lista 1×/s só para atualizar os tempos de espera.
function useTick(active: boolean) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [active])
}

function QueueRow({ item }: { item: QueueItem }) {
  const meta = STATE[item.state]
  const Icon = meta.icon
  const time =
    item.state === 'waiting' ? formatMs(nowMs() - item.enqueuedAt)
      : item.state === 'playing' && item.startedAt ? formatMs(nowMs() - item.startedAt)
        : item.startedAt && item.endedAt ? formatMs(item.endedAt - item.startedAt)
          : ''
  return (
    <li className={cn('group flex h-7 items-center gap-2 border-b border-line/60 px-2.5 text-xs', item.state === 'playing' && 'bg-brand-soft')}>
      <Icon className={cn('size-3.5 shrink-0', meta.className, item.state === 'playing' && 'animate-spin [animation-duration:2s]')} aria-label={meta.label} />
      <span className={cn('min-w-0 flex-1 truncate', item.state === 'done' || item.state === 'skipped' ? 'text-fg-3' : 'text-fg')} title={item.text}>
        {item.text}
      </span>
      {item.glossFallback && (
        <span className="shrink-0 font-mono text-[10px] text-warning" title="O tradutor não respondeu; o player recebeu o texto em português">
          SEM GLOSA
        </span>
      )}
      <span className="shrink-0 font-mono text-[10px] text-fg-3 uppercase">{item.source}</span>
      <span className="w-11 shrink-0 text-right font-mono text-[11px] text-fg-2 tabular">{time}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label="Ações do segmento" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => queue.replay(item.seg)}>
            <Redo2 /> Sinalizar novamente
          </DropdownMenuItem>
          {item.state === 'waiting' && (
            <DropdownMenuItem onSelect={() => queue.cancel(item.seg)}>
              <X /> Cancelar
            </DropdownMenuItem>
          )}
          {item.state === 'playing' && (
            <DropdownMenuItem onSelect={() => queue.skipCurrent()}>
              <SkipForward /> Pular
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(item.text)}>Copiar texto</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

export function QueueDock() {
  const { items, pending, lagMs, backlogMs, active, speed } = useStore(queue.store)
  const live = items.filter((it) => it.state === 'playing' || it.state === 'waiting')
  const finished = items.filter((it) => it.state !== 'playing' && it.state !== 'waiting').slice(-30).reverse()
  const failures = items.filter((it) => it.state === 'failed').length
  const listRef = useRef<HTMLDivElement>(null)
  useTick(live.length > 0)

  return (
    <Dock
      title="Fila de sinalização"
      icon={ListOrdered}
      status={<span className="font-mono text-[10px] text-fg-3">{String(pending).padStart(2, '0')}</span>}
      actions={
        <>
          <Button variant="ghost" size="icon-xs" title="Remover concluídos" aria-label="Remover concluídos" disabled={!finished.length} onClick={() => queue.clearFinished()}>
            <Trash2 />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="xs" disabled={!pending} className="text-fg-2">
                Esvaziar
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-3 text-xs">
              <p className="text-fg">Esvaziar {pending} {pending === 1 ? 'frase pendente' : 'frases pendentes'}?</p>
              <p className="mt-1 text-fg-3">As frases continuam na legenda e ficam registradas no diagnóstico, mas não serão sinalizadas.</p>
              <Button variant="destructive" size="sm" className="mt-3 w-full" onClick={() => queue.flush()}>
                Esvaziar fila
              </Button>
            </PopoverContent>
          </Popover>
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="grid shrink-0 grid-cols-4 border-b border-line text-center">
          {[
            ['Atraso', active ? formatMs(lagMs) : '—'],
            ['Estimativa', pending ? formatMs(backlogMs) : '—'],
            ['Velocidade', `${speed.toLocaleString('pt-BR')}x`],
            ['Falhas', String(failures)],
          ].map(([label, value]) => (
            <div key={label} className="border-r border-line py-1.5 last:border-r-0">
              <div className="text-[9px] tracking-wider text-fg-3 uppercase">{label}</div>
              <div className={cn('font-mono text-xs text-fg tabular', label === 'Atraso' && lagMs > 8000 ? 'text-danger' : label === 'Atraso' && lagMs > 3000 ? 'text-warning' : '')}>{value}</div>
            </div>
          ))}
        </div>
        <div ref={listRef} className="min-h-0 flex-1 overflow-auto">
          {!items.length ? (
            <EmptyState icon={ListOrdered} title="Fila vazia">
              Frases transcritas ou digitadas entram aqui na ordem em que serão sinalizadas.
            </EmptyState>
          ) : (
            <>
              <ul>{live.map((it) => <QueueRow key={it.seg} item={it} />)}</ul>
              {finished.length > 0 && (
                <>
                  <div className="sticky top-0 bg-panel px-2.5 pt-2 pb-1 text-[10px] tracking-wider text-fg-3 uppercase">Concluídos recentes</div>
                  <ul>{finished.map((it) => <QueueRow key={it.seg} item={it} />)}</ul>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </Dock>
  )
}
