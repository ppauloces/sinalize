// Telemetria do Sinalize: eventos por segmento e métricas derivadas (roda no processo principal).
//
// Evento: { t, src, type, seg, data }
//   t   — ms em base epoch de alta resolução (performance.timeOrigin + performance.now()),
//         comparável entre as janelas e o processo principal da mesma máquina.
//   seg — id do segmento: 'mic-<sessão>-<n>' (voz) ou 'txt-<sessão>-<n>' (texto/frases prontas).
//
// Linha do tempo de um segmento de voz:
//   seg.open → voice.on → partial.req/res… → seg.cut → final.req → final.res → sent
//   → recv (avatar) → gloss.req → gloss.res → play → anim.start → anim.end   (ou drop)

export interface TelEvent {
  t: number
  type: string
  seg?: string | null
  src?: string
  data?: Record<string, unknown>
}

const MAX_ITEMS = 50000

export function push<T>(list: T[], item: T) {
  list.push(item)
  if (list.length > MAX_ITEMS) list.splice(0, list.length - MAX_ITEMS)
}

export const countWords = (s: string | null | undefined) => ((s || '').match(/\S+/g) || []).length

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

// Percentil por posição mais próxima (nearest-rank)
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? null
}

const diff = (a?: TelEvent, b?: TelEvent) => (a && b ? Math.round(b.t - a.t) : null)

interface SegmentAcc {
  seg: string
  ev: Record<string, TelEvent>
  partials: number
  partialAudioMs: number
}

export function segments(events: TelEvent[]) {
  const bySeg = new Map<string, SegmentAcc>()
  for (const e of events) {
    if (!e.seg) continue
    let s = bySeg.get(e.seg)
    if (!s) bySeg.set(e.seg, (s = { seg: e.seg, ev: {}, partials: 0, partialAudioMs: 0 }))
    if (e.type === 'partial.res') {
      s.partials++
      s.partialAudioMs += num(e.data?.audioMs) ?? 0
    }
    if (!(e.type in s.ev)) s.ev[e.type] = e // guarda a 1ª ocorrência de cada tipo
  }
  return [...bySeg.values()]
    .filter((s) => Object.keys(s.ev).some((type) => type !== 'seg.open')) // segmento só de silêncio
    .map(derive)
    .sort((a, b) => a.t - b.t)
}

export type Segment = ReturnType<typeof derive>

function derive(s: SegmentAcc) {
  const E = s.ev
  const speechEnd = num(E['seg.cut']?.data?.lastVoiceAt)
  const animStart = E['anim.start']
  const text = str(E['final.res']?.data?.text) ?? str(E['recv']?.data?.text) ?? str(E['sent']?.data?.text) ?? ''
  const audioMs = num(E['final.req']?.data?.audioMs)
  const status = E['drop'] ? 'descartado'
    : E['anim.end'] ? 'sinalizado'
    : E['anim.timeout'] ? 'sem animação observada'
    : animStart ? 'sinalizando'
    : E['play'] ? 'enviado ao player'
    : E['recv'] ? 'na fila'
    : E['final.err'] ? 'erro ASR'
    : E['final.empty'] ? 'sem texto'
    : 'em reconhecimento'

  return {
    seg: s.seg,
    t: Math.min(...Object.values(E).map((e) => e.t)),
    status,
    text,
    words: countWords(text),
    audioMs,
    partials: s.partials,
    // quanto áudio foi transcrito no total / duração real do segmento (1 = sem redundância)
    retranscribeFactor: audioMs ? +((s.partialAudioMs + audioMs) / audioMs).toFixed(2) : null,
    firstPartialMs: diff(E['voice.on'], E['partial.res']),
    consolidationMs: speechEnd != null && E['final.res'] ? Math.round(E['final.res'].t - speechEnd) : null,
    asrQueueMs: diff(E['seg.cut'], E['final.req']),
    asrFinalMs: diff(E['final.req'], E['final.res']),
    ipcMs: diff(E['sent'], E['recv']),
    glossMs: diff(E['gloss.req'], E['gloss.res']),
    queueWaitMs: diff(E['recv'], E['play']),
    animStartMs: diff(E['play'], animStart),
    animDurMs: diff(animStart, E['anim.end']),
    e2eMs: speechEnd != null && animStart ? Math.round(animStart.t - speechEnd) : null,
    e2eFromSpeechStartMs: diff(E['voice.on'], animStart),
    speed: num(E['play']?.data?.speed),
    dropReason: str(E['drop']?.data?.reason),
  }
}

// Métricas com P50/P95/P99 no painel
export const METRICS = {
  e2eMs: 'Ponta a ponta (fim da fala → início do sinal)',
  e2eFromSpeechStartMs: 'Início da fala → início do sinal',
  firstPartialMs: 'Até o 1º parcial',
  consolidationMs: 'Consolidação (fim da fala → texto final)',
  asrQueueMs: 'Espera na fila do ASR',
  asrFinalMs: 'Transcrição final (speaches)',
  ipcMs: 'IPC controle → avatar',
  glossMs: 'Tradutor VLibras (texto → glosa)',
  queueWaitMs: 'Espera na fila do avatar',
  animStartMs: 'play() → animação iniciada',
  animDurMs: 'Duração da animação',
} as const satisfies Partial<Record<keyof Segment, string>>

export function summary(events: TelEvent[], now: number) {
  const segs = segments(events)
  const percentiles: Record<string, { n: number; p50: number | null; p95: number | null; p99: number | null }> = {}
  for (const key of Object.keys(METRICS) as (keyof typeof METRICS)[]) {
    const v = segs.map((s) => s[key]).filter((x): x is number => x != null)
    percentiles[key] = { n: v.length, p50: percentile(v, 50), p95: percentile(v, 95), p99: percentile(v, 99) }
  }

  // Palavras reconhecidas por minuto (últimos 60s, ou desde o 1º evento se menos)
  const finals = events.filter((e) => e.type === 'final.res')
  const windowMs = Math.min(60000, now - (events[0]?.t ?? now))
  const recentWords = finals.filter((e) => now - e.t <= 60000).reduce((n, e) => n + (num(e.data?.words) ?? 0), 0)
  const wpm = windowMs >= 5000 ? Math.round((recentWords * 60000) / windowMs) : null

  // Fila: o que já chegou ao avatar e ainda não terminou (nem foi descartado)
  const pending = segs.filter((s) => ['na fila', 'enviado ao player', 'sinalizando'].includes(s.status))
  const signed = segs.filter((s) => s.animDurMs != null && s.words)
  const msPerWord = signed.length
    ? signed.reduce((n, s) => n + (s.animDurMs ?? 0), 0) / signed.reduce((n, s) => n + s.words, 0)
    : null
  const queueEstimateMs = msPerWord != null
    ? Math.round(pending.reduce((n, s) => n + s.words, 0) * msPerWord)
    : null

  const factors = segs.map((s) => s.retranscribeFactor).filter((x): x is number => x != null)
  // Atraso da sinalização amostrado pelo avatar (~1/s enquanto há fila ou reprodução)
  const lagEvents = events.filter((e) => e.type === 'lag')
  const lags = lagEvents.map((e) => num(e.data?.lagMs) ?? 0)
  const lastLag = lagEvents.at(-1)
  return {
    counts: {
      segments: segs.length,
      signed: segs.filter((s) => s.status === 'sinalizado').length,
      dropped: segs.filter((s) => s.status === 'descartado').length,
      asrErrors: segs.filter((s) => s.status === 'erro ASR').length,
      partials: segs.reduce((n, s) => n + s.partials, 0),
      speedChanges: events.filter((e) => e.type === 'speed.change').length,
      asrLoops: events.filter((e) => e.type === 'asr.loop').length,
    },
    lag: {
      current: lastLag && now - lastLag.t < 2000 ? num(lastLag.data?.lagMs) ?? 0 : 0,
      p50: percentile(lags, 50),
      p95: percentile(lags, 95),
      max: lags.length ? Math.max(...lags) : null,
      speed: num(lastLag?.data?.speed),
    },
    percentiles,
    wpm,
    pendingBlocks: pending.length,
    queueEstimateMs,
    msPerWord: msPerWord != null ? Math.round(msPerWord) : null,
    retranscribeFactorAvg: factors.length ? +(factors.reduce((a, b) => a + b, 0) / factors.length).toFixed(2) : null,
    dropped: segs.filter((s) => s.status === 'descartado').map((s) => ({ seg: s.seg, text: s.text, reason: s.dropReason })),
  }
}

export function toCSV(rows: Record<string, unknown>[]) {
  const first = rows[0]
  if (!first) return ''
  const keys = Object.keys(first)
  const cell = (v: unknown) => (v == null ? '' : /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
  return [keys.join(','), ...rows.map((r) => keys.map((k) => cell(r[k])).join(','))].join('\n')
}
