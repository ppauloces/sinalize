// Validação das mensagens que atravessam o IPC (o processo principal nunca confia no renderer).
import { z } from 'zod'
import { CAPTION_LINE_STATES } from './output'

const seg = z.string().max(64)

export const captionEventSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('final'), seg, text: z.string().max(2000) }),
  z.object({ kind: z.literal('partial'), seg, text: z.string().max(2000) }),
  z.object({ kind: z.literal('state'), seg, state: z.enum(CAPTION_LINE_STATES) }),
  z.object({ kind: z.literal('clear') }),
])

export const playerStateSchema = z.object({
  status: z.enum(['idle', 'playing', 'paused']).nullable().catch(null),
  speed: z.number().finite().nullable().catch(null),
})

export const telemetryEventSchema = z.object({
  t: z.number().finite(),
  src: z.enum(['control', 'avatar']),
  type: z.string().max(40),
  seg: z.string().max(64).nullable(),
  data: z.record(z.string(), z.unknown()).optional(),
})

export const translateTextSchema = z.string().trim().min(1).max(5000)
export const exportFormatSchema = z.enum(['json', 'csv'])
export const themeSchema = z.enum(['dark', 'light'])

export interface SystemMetrics {
  t: number
  cpuPct: number | null
  appCpuPct: number
  appRamMB: number
  ramUsedMB: number
  ramTotalMB: number
  gpu: { name: string; util: number; usedMB: number; totalMB: number } | null
}
