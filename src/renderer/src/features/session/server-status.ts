// Disponibilidade do servidor local de transcrição (speaches em localhost:8000).
import { createStore } from 'zustand/vanilla'

export type ServerState = 'checking' | 'online' | 'offline'

const BASE = 'http://localhost:8000'
export const serverStore = createStore(() => ({ state: 'checking' as ServerState, models: [] as string[] }))
let checking = false

export const setServerState = (state: ServerState) => serverStore.setState({ state })

export async function checkLocalServer(manual = false) {
  if (checking) return
  checking = true
  if (manual) setServerState('checking')
  try {
    const res = await fetch(`${BASE}/health`, { cache: 'no-store', signal: AbortSignal.timeout(2500) })
    setServerState(res.status < 500 ? 'online' : 'offline')
    // Modelos de reconhecimento instalados no servidor (exibidos na barra de status).
    const models = await fetch(`${BASE}/v1/models`, { signal: AbortSignal.timeout(2500) })
      .then((r) => r.json() as Promise<{ data?: { id: string }[] }>)
      .then((d) => d.data?.map((m) => m.id) ?? [])
      .catch(() => [])
    serverStore.setState({ models })
  } catch {
    setServerState('offline')
  } finally {
    checking = false
  }
}

// Verifica a cada 15s, exceto durante a captura (a própria transcrição já informa o estado).
export function watchLocalServer(isBusy: () => boolean) {
  void checkLocalServer()
  const timer = setInterval(() => {
    if (!isBusy()) void checkLocalServer()
  }, 15000)
  return () => clearInterval(timer)
}
