import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { formatClock } from '@/lib/format'
import { cn } from '@/lib/utils'
import { sessionElapsed, sessionStore } from './session-store'

// Só este componente re-renderiza a cada segundo, não o workspace.
export function SessionClock({ className }: { className?: string }) {
  const session = useStore(sessionStore)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (session.phase !== 'live') return
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [session.phase])
  return <span className={cn('font-mono tabular', className)}>{formatClock(sessionElapsed(session, now))}</span>
}
