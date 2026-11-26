import { describe, expect, it } from 'vitest'
import { dbToRatio, formatDb, gainToDb, measure } from './meter'

describe('medidor de áudio', () => {
  it('senoide de amplitude 0,5 → pico −6 dB e RMS −9 dB', () => {
    const s = Float32Array.from({ length: 4800 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / 48000))
    const m = measure(s)
    expect(m.peakDb).toBeCloseTo(-6.02, 1)
    expect(m.rmsDb).toBeCloseTo(-9.03, 1)
    expect(m.clipped).toBe(false)
  })

  it('silêncio fica no piso e amostra cheia acusa clipping', () => {
    expect(measure(new Float32Array(128)).rmsDb).toBe(-60)
    expect(measure(Float32Array.from([0, 1, -1])).clipped).toBe(true)
  })

  it('escala e formatação', () => {
    expect(dbToRatio(-60)).toBe(0)
    expect(dbToRatio(-30)).toBe(0.5)
    expect(dbToRatio(3)).toBe(1)
    expect(formatDb(-60)).toBe('−∞')
    expect(formatDb(-12.34)).toBe('−12,3')
    expect(gainToDb(2)).toBeCloseTo(6.02, 1)
  })
})
