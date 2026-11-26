// Tema da interface e fundo do monitor de sinalização.
import { createStore } from 'zustand/vanilla'
import { persist } from 'zustand/middleware'
import { z } from 'zod'

export const MONITOR_BACKGROUNDS = [
  { id: 'neutral', label: 'Neutro', color: 'var(--monitor)' },
  { id: 'black', label: 'Preto', color: '#0b0c0e' },
  { id: 'white', label: 'Branco', color: '#ffffff' },
  { id: 'chroma', label: 'Verde (chroma key)', color: '#00b140' },
] as const

export type MonitorBackground = (typeof MONITOR_BACKGROUNDS)[number]['id']
export type Theme = 'dark' | 'light'

const schema = z.object({
  theme: z.enum(['dark', 'light']).catch('dark'),
  monitorBackground: z.enum(MONITOR_BACKGROUNDS.map((b) => b.id) as [MonitorBackground, ...MonitorBackground[]]).catch('neutral'),
  monitorSubtitles: z.boolean().catch(true),
})

export type Appearance = z.infer<typeof schema>

export const appearanceStore = createStore<Appearance>()(
  persist((): Appearance => ({ theme: 'dark', monitorBackground: 'neutral', monitorSubtitles: true }), {
    name: 'sinalize_appearance',
    merge: (persisted, current) => schema.parse({ ...current, ...(persisted as object) }),
  }),
)

export const setAppearance = (patch: Partial<Appearance>) => appearanceStore.setState(patch)

export const monitorColor = (id: MonitorBackground) => MONITOR_BACKGROUNDS.find((b) => b.id === id)?.color ?? 'var(--monitor)'

// Classe .dark no documento e cores dos botões nativos da barra de título.
export function syncTheme() {
  const apply = ({ theme }: Appearance) => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    window.sinalize.app.setTheme(theme)
  }
  apply(appearanceStore.getState())
  return appearanceStore.subscribe(apply)
}
