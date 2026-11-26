import { createStore } from '@/lib/store'

export type Tone = 'idle' | 'active' | 'error'

// Rodapé operacional do Studio.
export const statusStore = createStore<{ message: string; tone: Tone }>({ message: 'Pronto', tone: 'idle' })

export const setStatus = (message: string, tone: Tone = 'idle') => statusStore.set({ message, tone })

const SESSION = Math.random().toString(36).slice(2, 6)
let segCounter = 0

// Id de segmento da telemetria: mic-<sessão>-<n> (voz) ou txt-<sessão>-<n> (texto/frases prontas).
export const newSegId = (kind: 'mic' | 'txt') => `${kind}-${SESSION}-${++segCounter}`
