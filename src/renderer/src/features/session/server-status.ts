// Disponibilidade do servidor local de transcrição (speaches em localhost:8000).
import { createStore } from '@/lib/store'

export type ServerState = 'checking' | 'online' | 'offline'

const HEALTH_URL = 'http://localhost:8000/health'
export const serverStore = createStore<ServerState>('checking')
let checking = false

export async function checkLocalServer(manual = false) {
  if (checking) return
  checking = true
  if (manual) serverStore.set('checking')
  try {
    const res = await fetch(HEALTH_URL, { cache: 'no-store', signal: AbortSignal.timeout(2500) })
    serverStore.set(res.status < 500 ? 'online' : 'offline')
  } catch {
    serverStore.set('offline')
  } finally {
    checking = false
  }
}

// Verifica a cada 15s, exceto durante a gravação (a própria transcrição já informa o estado).
export function watchLocalServer(isBusy: () => boolean) {
  void checkLocalServer()
  const timer = setInterval(() => {
    if (!isBusy()) void checkLocalServer()
  }, 15000)
  return () => clearInterval(timer)
}
