import { useState } from 'react'
import { Mic, RotateCcw, Send, Square, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Panel, SectionLabel } from '@/components/section'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import type { MicTone } from './recorder'
import { flushQueue, queue, recentStore, recorder, send, toggleMic } from './session'
import { setStatus } from './status'

export const QUICK_PHRASES = ['Olá, bom dia', 'Tudo bem com você', 'Muito obrigado', 'Como você está', 'Bem vindo', 'Sim']

const MIC_TONE: Record<MicTone, string> = {
  idle: 'text-muted-foreground',
  recording: 'font-semibold text-success',
  processing: 'font-semibold text-warning',
  ok: 'font-semibold text-success',
  error: 'font-semibold text-danger',
}

function LevelMeter() {
  const level = useStore(recorder.level)
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-[image:var(--brand-gradient)] transition-[width] duration-75" style={{ width: `${level}%` }} />
    </div>
  )
}

function QueueState() {
  const { lagMs, pending, backlogMs, speed } = useStore(queue.store)
  if (pending === 0 && lagMs < 1500) return null
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[0.74rem] font-medium',
        lagMs > 8000 ? 'border-danger-border bg-danger-soft text-danger'
          : lagMs > 3000 ? 'border-warning-border bg-warning-soft text-warning'
          : 'bg-muted text-muted-foreground',
      )}
    >
      <span>
        Avatar: atraso {(lagMs / 1000).toFixed(0)} s · {pending} na fila
        {pending ? ` (≈${(backlogMs / 1000).toFixed(0)} s)` : ''} · {speed}x
      </span>
      <Button
        variant="outline"
        size="xs"
        onClick={flushQueue}
        title="Remove as frases que aguardam sinalização. Elas continuam na legenda e ficam registradas no diagnóstico."
      >
        Esvaziar fila
      </Button>
    </div>
  )
}

function VoiceCard() {
  const { recording, micState, transcript } = useStore(recorder.store)
  return (
    <Panel>
      <p className={cn('min-h-7 text-sm leading-snug break-words whitespace-pre-line', !transcript && 'text-muted-foreground')}>
        {transcript || 'Clique no microfone e fale normalmente — cada pausa envia uma frase...'}
      </p>
      {recording && <LevelMeter />}
      <p className={cn('text-[0.76rem]', MIC_TONE[micState.tone])}>{micState.message}</p>
      <QueueState />
      <Button variant={recording ? 'destructive' : 'brand'} size="lg" className="w-full" onClick={() => void toggleMic()}>
        {recording ? <Square className="fill-current" /> : <Mic />}
        {recording ? 'Parar gravação' : 'Iniciar gravação'}
      </Button>
    </Panel>
  )
}

function ManualInput() {
  const [text, setText] = useState('')
  const submit = () => (text.trim() ? send(text) : setStatus('Digite algo primeiro', 'error'))
  return (
    <Panel>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Digite uma frase para sinalizar..."
        className="min-h-20 resize-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <div className="flex gap-2">
        <Button variant="brand" className="flex-1" onClick={submit}>
          <Send />
          Traduzir
        </Button>
        <Button
          variant="outline"
          size="icon"
          title="Limpar campo"
          onClick={() => {
            setText('')
            setStatus('Pronto')
          }}
        >
          <Trash2 />
        </Button>
      </div>
    </Panel>
  )
}

function RecentList() {
  const recent = useStore(recentStore)
  if (!recent.length) return <p className="py-2 text-center text-[0.78rem] text-muted-foreground">Nenhuma tradução recente ainda</p>
  return (
    <div className="flex flex-col gap-1.5">
      {recent.map((item) => (
        <button
          key={item}
          type="button"
          title="Clique para reenviar"
          onClick={() => send(item)}
          className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-left text-[0.8rem] transition-colors hover:border-ring/40 hover:bg-accent"
        >
          <span className="truncate">{item}</span>
          <RotateCcw className="size-3 shrink-0 text-muted-foreground" />
        </button>
      ))}
    </div>
  )
}

export function ControlTab() {
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Voz</SectionLabel>
      <VoiceCard />

      <SectionLabel hint="Atalhos [1-6]">Frases prontas</SectionLabel>
      <div className="grid grid-cols-2 gap-2">
        {QUICK_PHRASES.map((phrase, i) => (
          <button
            key={phrase}
            type="button"
            onClick={() => send(phrase)}
            className="group flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-left text-[0.8rem] font-medium shadow-xs transition-colors hover:border-ring/40 hover:bg-accent"
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-[0.68rem] font-bold text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground">
              {i + 1}
            </span>
            <span className="truncate">{phrase}</span>
          </button>
        ))}
      </div>

      <SectionLabel hint="Ctrl+Enter envia">Texto manual</SectionLabel>
      <ManualInput />

      <SectionLabel>Últimas traduções</SectionLabel>
      <RecentList />
    </div>
  )
}
