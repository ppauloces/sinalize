// Preferências de captura: dispositivo, ganho, mudo e calibração da detecção de fala.
import { createStore } from 'zustand/vanilla'
import { persist } from 'zustand/middleware'
import { z } from 'zod'

export const AUDIO_DEFAULTS = {
  deviceId: 'default',
  gain: 1, // linear: 0 (−∞) a 2 (+6 dB)
  muted: false,
  vadLevel: 18, // média do espectro (0–255) acima da qual há fala
  silenceMs: 700, // pausa que fecha uma frase
}

const schema = z.object({
  deviceId: z.string().max(200).catch(AUDIO_DEFAULTS.deviceId),
  gain: z.number().min(0).max(2).catch(AUDIO_DEFAULTS.gain),
  muted: z.boolean().catch(AUDIO_DEFAULTS.muted),
  vadLevel: z.number().min(4).max(80).catch(AUDIO_DEFAULTS.vadLevel),
  silenceMs: z.number().min(300).max(2500).catch(AUDIO_DEFAULTS.silenceMs),
})

export type AudioSettings = z.infer<typeof schema>

export const audioSettingsStore = createStore<AudioSettings>()(
  persist(() => ({ ...AUDIO_DEFAULTS }), {
    name: 'sinalize_audio',
    merge: (persisted, current) => ({ ...current, ...schema.parse({ ...current, ...(persisted as object) }) }),
  }),
)

export const setAudioSettings = (patch: Partial<AudioSettings>) => audioSettingsStore.setState(schema.parse({ ...audioSettingsStore.getState(), ...patch }))
