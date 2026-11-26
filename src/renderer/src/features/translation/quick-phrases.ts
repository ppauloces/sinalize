// Frases rápidas (atalhos 1–9) editáveis nas configurações.
import { createStore } from 'zustand/vanilla'
import { persist } from 'zustand/middleware'
import { z } from 'zod'

export const DEFAULT_PHRASES = ['Olá, bom dia', 'Tudo bem com você', 'Muito obrigado', 'Como você está', 'Bem vindo', 'Sim']
export const MAX_PHRASES = 9

const schema = z.object({ phrases: z.array(z.string().trim().min(1).max(120)).max(MAX_PHRASES).catch(DEFAULT_PHRASES) })

export const phrasesStore = createStore<{ phrases: string[] }>()(
  persist(() => ({ phrases: DEFAULT_PHRASES }), {
    name: 'sinalize_quick_phrases',
    merge: (persisted, current) => schema.parse({ ...current, ...(persisted as object) }),
  }),
)

export const setPhrases = (phrases: string[]) => phrasesStore.setState(schema.parse({ phrases: phrases.map((p) => p.trim()).filter(Boolean) }))
