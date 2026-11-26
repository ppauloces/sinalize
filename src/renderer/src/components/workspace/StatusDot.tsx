import { cn } from '@/lib/utils'

export type Tone = 'ok' | 'warn' | 'error' | 'idle' | 'live'

const TONE: Record<Tone, string> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  error: 'bg-danger',
  idle: 'bg-fg-3',
  live: 'bg-danger animate-live',
}

export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-1.5 shrink-0 rounded-full', TONE[tone], className)} />
}
