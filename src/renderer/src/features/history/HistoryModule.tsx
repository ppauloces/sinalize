import { useMemo, useState } from 'react'
import { History, Redo2, Search } from 'lucide-react'
import { useStore } from 'zustand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/workspace/Dock'
import { ModuleFrame } from '@/components/workspace/ModuleFrame'
import { formatClock, formatMs } from '@/lib/format'
import { cn } from '@/lib/utils'
import { queue } from '../session/session'
import { sessionStore } from '../session/session-store'
import type { QueueItemState } from '../translation/signing-queue'

const STATE_LABEL: Record<QueueItemState, string> = { waiting: 'Aguardando', playing: 'Sinalizando', done: 'Sinalizado', skipped: 'Pulado', failed: 'Sem animação' }
const STATE_CLASS: Record<QueueItemState, string> = { waiting: 'text-fg-3', playing: 'text-brand-fg', done: 'text-success', skipped: 'text-fg-3', failed: 'text-danger' }

// Tudo o que foi enviado ao avatar na sessão: voz, texto, frases rápidas e repetições.
export function HistoryModule() {
  const items = useStore(queue.store, (s) => s.items)
  const startedAt = useStore(sessionStore, (s) => s.startedAt)
  const [query, setQuery] = useState('')
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...items].reverse().filter((it) => !q || it.text.toLowerCase().includes(q))
  }, [items, query])
  const origin = startedAt ?? items[0]?.enqueuedAt ?? 0

  return (
    <ModuleFrame
      title="Histórico"
      description="Segmentos enviados ao avatar nesta sessão"
      icon={History}
      actions={
        <div className="relative w-48">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-fg-3" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" aria-label="Buscar no histórico" className="h-6 pl-6 text-[11px]" />
        </div>
      }
    >
      {!rows.length ? (
        <EmptyState icon={History} title="Nada sinalizado ainda">
          Frases da transcrição, da tradução manual e das frases rápidas aparecem aqui.
        </EmptyState>
      ) : (
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-panel text-left text-[10px] tracking-wider text-fg-3 uppercase">
            <tr className="border-b border-line">
              <th className="w-20 px-3 py-1.5 font-medium">Tempo</th>
              <th className="w-20 px-2 py-1.5 font-medium">Origem</th>
              <th className="px-2 py-1.5 font-medium">Texto</th>
              <th className="w-24 px-2 py-1.5 font-medium">Estado</th>
              <th className="w-16 px-2 py-1.5 text-right font-medium">Duração</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((it) => (
              <tr key={it.seg} className="group border-b border-line/60 hover:bg-hover">
                <td className="px-3 py-1.5 font-mono text-[11px] text-fg-3 tabular">{formatClock(it.enqueuedAt - origin)}</td>
                <td className="px-2 py-1.5 font-mono text-[10px] text-fg-3 uppercase">{it.source}</td>
                <td className="px-2 py-1.5 text-fg">{it.text}</td>
                <td className={cn('px-2 py-1.5 text-[11px]', STATE_CLASS[it.state])}>{STATE_LABEL[it.state]}</td>
                <td className="px-2 py-1.5 text-right font-mono text-[11px] text-fg-2 tabular">{it.startedAt && it.endedAt ? formatMs(it.endedAt - it.startedAt) : '—'}</td>
                <td className="pr-2 text-right">
                  <Button variant="ghost" size="icon-xs" aria-label="Sinalizar novamente" title="Sinalizar novamente" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100" onClick={() => queue.replay(it.seg)}>
                    <Redo2 />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ModuleFrame>
  )
}
