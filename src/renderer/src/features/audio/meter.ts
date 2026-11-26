// Níveis em dBFS a partir das amostras reais do AnalyserNode (sem simulação).
export const METER_FLOOR_DB = -60
export const CLIP_LEVEL = 0.989 // ≈ −0,1 dBFS

export const toDb = (amplitude: number) => (amplitude > 0 ? Math.max(METER_FLOOR_DB, 20 * Math.log10(amplitude)) : METER_FLOOR_DB)

export function measure(samples: Float32Array) {
  let sum = 0
  let peak = 0
  for (const s of samples) {
    sum += s * s
    const a = Math.abs(s)
    if (a > peak) peak = a
  }
  const rms = Math.sqrt(sum / (samples.length || 1))
  return { rmsDb: toDb(rms), peakDb: toDb(peak), peak, clipped: peak >= CLIP_LEVEL }
}

// Posição 0–1 na escala do medidor (−60 dB a 0 dB).
export const dbToRatio = (db: number) => Math.min(1, Math.max(0, (db - METER_FLOOR_DB) / -METER_FLOOR_DB))

export const formatDb = (db: number) => (db <= METER_FLOOR_DB ? '−∞' : db.toFixed(1).replace('-', '−').replace('.', ','))

export const gainToDb = (gain: number) => (gain <= 0 ? -Infinity : 20 * Math.log10(gain))
