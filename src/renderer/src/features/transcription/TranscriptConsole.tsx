import { useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDownToLine, Copy, Download, Loader, ScrollText, Search, Trash2 } from 'lucide-react'
import { useStore } from 'zustand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dock, EmptyState } from '@/components/workspace/Dock'
import { formatClock } from '@/lib/format'
import { cn } from '@/lib/utils'
import { actions } from '../command/actions'
import { sessionStore } from '../session/session-store'
import { transcriptStore, type TranscriptEntry } from './transcript-store'

const STATUS_LABEL: Record<TranscriptEntry['status'], string> = {
  listening: 'ouvindo',
  partial: 'parcial',
  processing: 'processando',
  final: 'final',
  empty: 'sem texto',
  error: 'erro',
}

function Row({ entry, origin }: { entry: TranscriptEntry; origin: number }) {
  const pending = entry.status !== 'final' && entry.status !== 'error'
  return (
    <div className="flex gap-3 px-3 py-1 text-xs leading-relaxed">
      <span className="w-14 shrink-0 pt-px font-mono text-[11px] text-fg-3 tabular">{formatClock(entry.at - origin)}</span>
      <span className={cn('w-20 shrink-0 pt-px font-mono text-[10px] tracking-wide uppercase', entry.status === 'final' ? 'text-fg-3' : entry.status === 'error' ? 'text-danger' : 'text-brand-fg')}>
        {entry.status === 'processing' && <Loader className="mr-1 inline size-3 animate-spin align-[-2px]" />}
        {STATUS_LABEL[entry.status]}
      </span>
      <p className={cn('min-w-0 flex-1 break-words select-text', pending ? 'text-fg-2 italic' : 'text-fg', entry.status === 'error' && 'text-danger not-italic')}>
        {entry.status === 'error' ? entry.error : entry.text || '…'}
        {entry.repaired && (
          <span className="ml-2 rounded-xs bg-warning-soft px-1 font-mono text-[9px] text-warning not-italic" title="Repetição anômala do reconhecimento removida">
            LOOP CORRIGIDO
          </span>
        )}
      </p>
    </div>
  )
}

export function TranscriptConsole({ embedded }: { embedded?: boolean }) {
  const entries = useStore(transcriptStore, (s) => s.entries)
  const startedAt = useStore(sessionStore, (s) => s.startedAt)
  const [query, setQuery] = useState('')
  const [follow, setFollow] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries.filter((e) => e.status !== 'empty' && (!q || e.text.toLowerCase().includes(q)))
  }, [entries, query])
  const origin = startedAt ?? rows[0]?.at ?? 0

  // eslint-disable-next-line react-hooks/incompatible-library -- o virtualizador mede as linhas fora do React
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => 26, overscan: 12 })
  const last = rows.at(-1)

  // Acompanha a fala mais recente; rolar para cima pausa só a rolagem, nunca o reconhecimento.
  useEffect(() => {
    if (follow && rows.length) virtualizer.scrollToIndex(rows.length - 1, { align: 'end' })
  }, [follow, rows.length, last?.text, last?.status, virtualizer])

  const toolbar = (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-1.5 size-3 -translate-y-1/2 text-fg-3" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" aria-label="Buscar na transcrição" className="h-6 w-32 pl-5 text-[11px]" />
      </div>
      <Button variant="ghost" size="icon-xs" aria-pressed={follow} aria-label="Acompanhar fala ao vivo" title={follow ? 'Pausar acompanhamento (o ASR continua)' : 'Acompanhar fala ao vivo'} className={cn(follow && 'bg-brand-soft text-brand-fg')} onClick={() => setFollow((f) => !f)}>
        <ArrowDownToLine />
      </Button>
      <Button variant="ghost" size="icon-xs" aria-label="Copiar" title="Copiar transcrição" disabled={!rows.length} onClick={actions.copyTranscript}>
        <Copy />
      </Button>
      <Button variant="ghost" size="icon-xs" aria-label="Exportar" title="Exportar (.txt)" disabled={!rows.length} onClick={actions.exportTranscript}>
        <Download />
      </Button>
      <Button variant="ghost" size="icon-xs" aria-label="Limpar" title="Limpar visualização" disabled={!entries.length} onClick={actions.clearTranscript}>
        <Trash2 />
      </Button>
    </>
  )

  const body = (
    <div
      ref={scrollRef}
      className="h-full overflow-auto"
      onWheel={(e) => e.deltaY < 0 && follow && setFollow(false)}
      onScroll={(e) => {
        const el = e.currentTarget
        if (!follow && el.scrollHeight - el.scrollTop - el.clientHeight < 4) setFollow(true)
      }}
    >
      {!rows.length ? (
        <EmptyState icon={ScrollText} title={query ? 'Nada encontrado' : 'Sem transcrição'}>
          {query ? 'Nenhum segmento contém o termo buscado.' : 'Inicie a sessão para transcrever a fala em tempo real.'}
        </EmptyState>
      ) : (
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((v) => (
            <div key={v.key} data-index={v.index} ref={virtualizer.measureElement} className="absolute inset-x-0 top-0" style={{ transform: `translateY(${v.start}px)` }}>
              <Row entry={rows[v.index]!} origin={origin} />
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return embedded ? (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-end gap-1 border-b border-line px-2">{toolbar}</div>
      <div className="min-h-0 flex-1">{body}</div>
    </div>
  ) : (
    <Dock title="Transcrição em tempo real" icon={ScrollText} actions={toolbar} bodyClassName="overflow-hidden">
      {body}
    </Dock>
  )
}
