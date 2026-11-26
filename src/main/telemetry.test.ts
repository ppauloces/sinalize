import { describe, expect, it } from 'vitest'
import { percentile, segments, summary, toCSV, type TelEvent } from './telemetry'

const ev = (t: number, type: string, seg: string | null, data?: Record<string, unknown>): TelEvent => ({ t, type, seg, data })

const events: TelEvent[] = [
  ev(0, 'seg.open', 'mic-a-1'), ev(100, 'voice.on', 'mic-a-1'),
  ev(500, 'partial.res', 'mic-a-1', { audioMs: 500 }), ev(900, 'partial.res', 'mic-a-1', { audioMs: 900 }),
  ev(2000, 'seg.cut', 'mic-a-1', { lastVoiceAt: 1300 }), ev(2010, 'final.req', 'mic-a-1', { audioMs: 2000 }),
  ev(2400, 'final.res', 'mic-a-1', { text: 'bom dia a todos', words: 4 }), ev(2405, 'sent', 'mic-a-1'),
  ev(2410, 'recv', 'mic-a-1', { text: 'bom dia a todos' }), ev(2410, 'gloss.req', 'mic-a-1'),
  ev(2700, 'gloss.res', 'mic-a-1'), ev(2750, 'play', 'mic-a-1', { speed: 2 }),
  ev(2900, 'anim.start', 'mic-a-1'), ev(4900, 'anim.end', 'mic-a-1'),
  // 2º segmento é descartado pelo operador; o 3º ainda espera
  ev(5000, 'recv', 'txt-a-2', { text: 'um dois' }), ev(5100, 'drop', 'txt-a-2', { reason: 'substituído' }),
  ev(5100, 'recv', 'txt-a-3', { text: 'três quatro cinco' }),
  ev(5200, 'seg.open', 'mic-a-4'), // só silêncio: não aparece
]

describe('telemetria', () => {
  it('percentil nearest-rank', () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3)
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10)
    expect(percentile([], 50)).toBeNull()
  })

  it('deriva métricas por segmento', () => {
    const segs = segments(events)
    expect(segs).toHaveLength(3)
    const [s1, s2, s3] = segs
    expect(s1).toMatchObject({
      firstPartialMs: 400,
      consolidationMs: 1100,
      glossMs: 290,
      queueWaitMs: 340,
      e2eMs: 1600,
      animDurMs: 2000,
      retranscribeFactor: 1.7,
      status: 'sinalizado',
    })
    expect(s2?.status).toBe('descartado')
    expect(s3?.status).toBe('na fila')
  })

  it('resume fila, ritmo e atraso', () => {
    const sum = summary(events, 6000)
    expect(sum.counts.dropped).toBe(1)
    expect(sum.pendingBlocks).toBe(1)
    expect(sum.msPerWord).toBe(500)
    expect(sum.queueEstimateMs).toBe(1500)
    expect(sum.wpm).toBe(40)
    const withLag = [...events, ev(5500, 'lag', null, { lagMs: 1000, speed: 2 }), ev(5900, 'lag', null, { lagMs: 5000, speed: 2.5 })]
    const lag = summary(withLag, 6000).lag
    expect([lag.current, lag.max, lag.speed]).toEqual([5000, 5000, 2.5])
    expect(toCSV(segments(events))).toMatch(/^seg,t,status/)
  })
})
