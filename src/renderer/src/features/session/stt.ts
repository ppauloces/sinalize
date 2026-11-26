// Transcrição Whisper: OpenAI (API paga) ou servidor local speaches (localhost:8000).
import { createStore } from 'zustand/vanilla'
import { readString, write } from '@/lib/storage'

export type SttProviderId = 'openai' | 'local'

export const STT_PROVIDERS: Record<SttProviderId, { label: string; url: string; model: string; needsKey: boolean; finalTimeoutMs: number }> = {
  openai: {
    label: 'OpenAI (API, pago)',
    url: 'https://api.openai.com/v1/audio/transcriptions',
    model: 'gpt-4o-mini-transcribe',
    needsKey: true,
    finalTimeoutMs: 30000,
  },
  local: {
    label: 'Local (speaches em localhost:8000)',
    url: 'http://localhost:8000/v1/audio/transcriptions',
    model: 'Systran/faster-whisper-small',
    needsKey: false,
    finalTimeoutMs: 15000,
  },
}

// Chaves herdadas da v1: preferências existentes continuam valendo.
const PROVIDER_KEY = 'sinalize_stt_provider'
const API_KEY = 'sinalize_openai_key'

const savedProvider = readString(PROVIDER_KEY, 'openai')
export const sttStore = createStore(() => ({
  provider: (savedProvider in STT_PROVIDERS ? savedProvider : 'openai') as SttProviderId,
  apiKey: readString(API_KEY),
}))
sttStore.subscribe(({ provider, apiKey }) => {
  write(PROVIDER_KEY, provider)
  write(API_KEY, apiKey.trim())
})

export const currentProvider = () => STT_PROVIDERS[sttStore.getState().provider]
export const hasValidKey = () => !currentProvider().needsKey || sttStore.getState().apiKey.trim().startsWith('sk-')

export class HttpError extends Error {
  readonly status: number
  readonly body: string

  constructor(status: number, body: string) {
    super(`HTTP ${status}`)
    this.status = status
    this.body = body
  }
}

// `temperature` > 0 é usado só na retentativa de um segmento com loop (fallback do Whisper).
export async function transcribe(blob: Blob, timeoutMs: number, controller = new AbortController(), temperature?: number) {
  const p = currentProvider()
  const form = new FormData()
  form.append('file', blob, 'audio.webm')
  form.append('model', p.model)
  form.append('language', 'pt')
  if (temperature !== undefined) form.append('temperature', String(temperature))

  const headers: Record<string, string> = p.needsKey ? { Authorization: 'Bearer ' + sttStore.getState().apiKey.trim() } : {}
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
  let res: Response
  try {
    res = await fetch(p.url, { method: 'POST', headers, body: form, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new HttpError(res.status, await res.text())
  const text = (((await res.json()) as { text?: string }).text || '').trim()
  // Alucinação conhecida do Whisper em silêncio
  return /amara\.org/i.test(text) ? '' : text
}
