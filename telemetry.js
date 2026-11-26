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

const MAX_ITEMS = 50000

function push(list, item) {
  list.push(item)
  if (list.length > MAX_ITEMS) list.splice(0, list.length - MAX_ITEMS)
}

const countWords = (s) => ((s || '').match(/\S+/g) || []).length

// Percentil por posição mais próxima (nearest-rank)
function percentile(values, p) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

const diff = (a, b) => (a && b ? Math.round(b.t - a.t) : null)

function segments(events) {
  const bySeg = new Map()
  for (const e of events) {
    if (!e.seg) continue
    let s = bySeg.get(e.seg)
    if (!s) bySeg.set(e.seg, (s = { seg: e.seg, ev: {}, partials: 0, partialAudioMs: 0 }))
    if (e.type === 'partial.res') {
      s.partials++
      s.partialAudioMs += e.data?.audioMs || 0
    }
    if (!(e.type in s.ev)) s.ev[e.type] = e // guarda a 1ª ocorrência de cada tipo
  }
  return [...bySeg.values()]
    .filter((s) => Object.keys(s.ev).some((type) => type !== 'seg.open')) // segmento só de silêncio
    .map(derive)
    .sort((a, b) => a.t - b.t)
}

function derive(s) {
  const E = s.ev
  const speechEnd = E['seg.cut']?.data?.lastVoiceAt ?? null
  const animStart = E['anim.start']
  const text = E['final.res']?.data?.text ?? E['recv']?.data?.text ?? E['sent']?.data?.text ?? ''
  const audioMs = E['final.req']?.data?.audioMs ?? null
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
    speed: E['play']?.data?.speed ?? null,
    dropReason: E['drop']?.data?.reason ?? null,
  }
}

// Métricas com P50/P95/P99 no painel
const METRICS = {
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
}

function summary(events, now) {
  const segs = segments(events)
  const percentiles = {}
  for (const key of Object.keys(METRICS)) {
    const v = segs.map((s) => s[key]).filter((x) => x != null)
    percentiles[key] = { n: v.length, p50: percentile(v, 50), p95: percentile(v, 95), p99: percentile(v, 99) }
  }

  // Palavras reconhecidas por minuto (últimos 60s, ou desde o 1º evento se menos)
  const finals = events.filter((e) => e.type === 'final.res')
  const windowMs = Math.min(60000, now - (events[0]?.t ?? now))
  const recentWords = finals.filter((e) => now - e.t <= 60000).reduce((n, e) => n + (e.data?.words || 0), 0)
  const wpm = windowMs >= 5000 ? Math.round((recentWords * 60000) / windowMs) : null

  // Fila: o que já chegou ao avatar e ainda não terminou (nem foi descartado)
  const pending = segs.filter((s) => ['na fila', 'enviado ao player', 'sinalizando'].includes(s.status))
  const signed = segs.filter((s) => s.animDurMs != null && s.words)
  const msPerWord = signed.length
    ? signed.reduce((n, s) => n + s.animDurMs, 0) / signed.reduce((n, s) => n + s.words, 0)
    : null
  const queueEstimateMs = msPerWord != null
    ? Math.round(pending.reduce((n, s) => n + s.words, 0) * msPerWord)
    : null

  const factors = segs.map((s) => s.retranscribeFactor).filter((x) => x != null)
  // Atraso da sinalização amostrado pelo avatar (~1/s enquanto há fila ou reprodução)
  const lags = events.filter((e) => e.type === 'lag').map((e) => e.data.lagMs)
  const lastLag = events.findLast((e) => e.type === 'lag')
  return {
    counts: {
      segments: segs.length,
      signed: segs.filter((s) => s.status === 'sinalizado').length,
      dropped: segs.filter((s) => s.status === 'descartado').length,
      asrErrors: segs.filter((s) => s.status === 'erro ASR').length,
      partials: segs.reduce((n, s) => n + s.partials, 0),
      speedChanges: events.filter((e) => e.type === 'speed.change').length,
    },
    lag: {
      current: lastLag && now - lastLag.t < 2000 ? lastLag.data.lagMs : 0,
      p50: percentile(lags, 50),
      p95: percentile(lags, 95),
      max: lags.length ? Math.max(...lags) : null,
      speed: lastLag?.data.speed ?? null,
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

function toCSV(rows) {
  if (!rows.length) return ''
  const keys = Object.keys(rows[0])
  const cell = (v) => (v == null ? '' : /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
  return [keys.join(','), ...rows.map((r) => keys.map((k) => cell(r[k])).join(','))].join('\n')
}

module.exports = { push, segments, summary, percentile, toCSV, countWords, METRICS }

// Verificação rápida: node telemetry.js
if (require.main === module) {
  const assert = require('assert')
  assert.strictEqual(percentile([5, 1, 3, 2, 4], 50), 3)
  assert.strictEqual(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10)
  assert.strictEqual(percentile([], 50), null)

  const ev = (t, type, seg, data) => ({ t, type, seg, data })
  const events = [
    ev(0, 'seg.open', 'mic-a-1'), ev(100, 'voice.on', 'mic-a-1'),
    ev(500, 'partial.res', 'mic-a-1', { audioMs: 500 }), ev(900, 'partial.res', 'mic-a-1', { audioMs: 900 }),
    ev(2000, 'seg.cut', 'mic-a-1', { lastVoiceAt: 1300 }), ev(2010, 'final.req', 'mic-a-1', { audioMs: 2000 }),
    ev(2400, 'final.res', 'mic-a-1', { text: 'bom dia a todos', words: 4 }), ev(2405, 'sent', 'mic-a-1'),
    ev(2410, 'recv', 'mic-a-1', { text: 'bom dia a todos' }), ev(2410, 'gloss.req', 'mic-a-1'),
    ev(2700, 'gloss.res', 'mic-a-1'), ev(2750, 'play', 'mic-a-1', { speed: 2 }),
    ev(2900, 'anim.start', 'mic-a-1'), ev(4900, 'anim.end', 'mic-a-1'),
    // 2º segmento chega e é substituído por um 3º antes de tocar
    ev(5000, 'recv', 'txt-a-2', { text: 'um dois' }), ev(5100, 'drop', 'txt-a-2', { reason: 'substituído' }),
    ev(5100, 'recv', 'txt-a-3', { text: 'três quatro cinco' }),
    ev(5200, 'seg.open', 'mic-a-4'), // só silêncio: não aparece
  ]
  assert.strictEqual(segments(events).length, 3)
  const [s1, s2, s3] = segments(events)
  assert.strictEqual(s1.firstPartialMs, 400)
  assert.strictEqual(s1.consolidationMs, 1100) // 2400 - lastVoiceAt 1300
  assert.strictEqual(s1.glossMs, 290)
  assert.strictEqual(s1.queueWaitMs, 340)
  assert.strictEqual(s1.e2eMs, 1600) // anim.start 2900 - fim da fala 1300
  assert.strictEqual(s1.animDurMs, 2000)
  assert.strictEqual(s1.retranscribeFactor, 1.7) // (500+900+2000)/2000
  assert.strictEqual(s1.status, 'sinalizado')
  assert.strictEqual(s2.status, 'descartado')
  assert.strictEqual(s3.status, 'na fila')

  const sum = summary(events, 6000)
  assert.strictEqual(sum.counts.dropped, 1)
  assert.strictEqual(sum.pendingBlocks, 1)
  assert.strictEqual(sum.msPerWord, 500) // 2000ms / 4 palavras
  assert.strictEqual(sum.queueEstimateMs, 1500) // 3 palavras pendentes × 500ms
  assert.strictEqual(sum.wpm, 40) // 4 palavras em 6s
  const withLag = [...events, ev(5500, 'lag', null, { lagMs: 1000, speed: 2 }), ev(5900, 'lag', null, { lagMs: 5000, speed: 2.5 })]
  const lagSum = summary(withLag, 6000).lag
  assert.deepStrictEqual([lagSum.current, lagSum.max, lagSum.speed], [5000, 5000, 2.5])
  assert.ok(toCSV(segments(events)).startsWith('seg,t,status'))
  console.log('telemetry OK')
}
