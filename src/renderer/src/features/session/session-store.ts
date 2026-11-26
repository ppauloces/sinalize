// Ciclo de vida da sessão ao vivo e cronômetro (pausas não contam no tempo da sessão).
import { createStore } from 'zustand/vanilla'

export type SessionPhase = 'idle' | 'live' | 'paused'

interface SessionState {
  phase: SessionPhase
  startedAt: number | null
  pausedAt: number | null
  pausedTotal: number
}

export const sessionStore = createStore<SessionState>(() => ({ phase: 'idle', startedAt: null, pausedAt: null, pausedTotal: 0 }))

export function sessionElapsed(s: SessionState, now = Date.now()) {
  if (!s.startedAt) return 0
  return (s.pausedAt ?? now) - s.startedAt - s.pausedTotal
}

export const sessionClock = {
  start: () => sessionStore.setState({ phase: 'live', startedAt: Date.now(), pausedAt: null, pausedTotal: 0 }),
  pause: () => sessionStore.setState({ phase: 'paused', pausedAt: Date.now() }),
  resume: () =>
    sessionStore.setState((s) => ({ phase: 'live', pausedAt: null, pausedTotal: s.pausedTotal + (s.pausedAt ? Date.now() - s.pausedAt : 0) })),
  // Congela o cronômetro no tempo final até a próxima sessão.
  stop: () => sessionStore.setState((s) => ({ phase: 'idle', pausedAt: s.pausedAt ?? Date.now() })),
}
