import type { TelemetryEvent } from '../../../shared/api'

// Mesmo relógio do processo principal e das demais janelas (ver src/main/telemetry.ts).
export const nowMs = () => performance.timeOrigin + performance.now()
export const countWords = (s: string | null | undefined) => ((s || '').match(/\S+/g) || []).length

export function tel(src: TelemetryEvent['src'], type: string, seg: string | null, data?: Record<string, unknown>) {
  globalThis.window?.sinalize?.telemetry({ t: nowMs(), src, type, seg, data })
}
