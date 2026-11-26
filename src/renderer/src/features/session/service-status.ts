// Estado consolidado dos serviços (reconhecimento de voz e VLibras) para barras e docks.
import { useStore } from 'zustand'
import type { Tone } from '@/components/workspace/StatusDot'
import { playerStore } from '../avatar/player'
import { outputStore } from '../output/output-store'
import { serverStore } from './server-status'
import { STT_PROVIDERS, sttStore } from './stt'

export function useAsrStatus(): { tone: Tone; label: string; model: string } {
  const { provider, apiKey } = useStore(sttStore)
  const server = useStore(serverStore, (s) => s.state)
  const model = STT_PROVIDERS[provider].model
  if (provider === 'openai') {
    return apiKey.trim().startsWith('sk-') ? { tone: 'ok', label: 'OpenAI', model } : { tone: 'warn', label: 'OpenAI sem chave', model }
  }
  if (server === 'online') return { tone: 'ok', label: 'ASR local online', model }
  if (server === 'checking') return { tone: 'warn', label: 'ASR local verificando', model }
  return { tone: 'error', label: 'ASR local offline', model }
}

export const ENGINE_LABEL = { studio: 'Studio', presentation: 'Telão', overlay: 'Overlay' } as const

export function useVlibrasStatus(): { tone: Tone; label: string } {
  const status = useStore(playerStore, (s) => s.status)
  const engine = useStore(outputStore, (s) => s.state?.engine ?? 'studio')
  if (status === null) return { tone: 'warn', label: `VLibras carregando (${ENGINE_LABEL[engine]})` }
  return { tone: 'ok', label: `VLibras · ${ENGINE_LABEL[engine]}` }
}

