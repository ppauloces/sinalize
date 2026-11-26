// Proteção contra loops de decodificação do Whisper ("o que é que é que é que é que...").
//
// Causa: o speaches envia temperature = 0 fixo ao faster-whisper, o que desliga o fallback de
// temperatura (a proteção do próprio modelo contra repetição). Áudio cortado no meio da palavra
// (parciais e cortes por limite de duração) e ruído aumentam a chance do loop.
//
// Detecção por estrutura, não por padrão de texto: sequências de n-gramas repetidos em série e
// taxa de palavras por segundo incompatível com fala humana. Repetições curtas e naturais
// ("não, não, não", "vamos lá, vamos lá") ficam abaixo dos limites e são preservadas.

const MAX_NGRAM = 8
// Repetições consecutivas mínimas para considerar anômalo, por tamanho do n-grama.
const minRepeats = (n: number) => (n === 1 ? 6 : n <= 3 ? 4 : 3)
// Fala rápida em português fica em ~3–4 palavras/s; loops geram dezenas.
const MAX_WORDS_PER_SECOND = 6
const MIN_WORDS_FOR_RATE = 12

export interface RepetitionRun {
  start: number
  size: number
  count: number
}

export interface GuardResult {
  text: string
  abnormal: boolean
  reason: 'repetition' | 'rate' | null
  runs: RepetitionRun[]
  coverage: number
}

const normalizeToken = (w: string) =>
  w
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '')

function sameNgram(tokens: string[], a: number, b: number, n: number) {
  for (let k = 0; k < n; k++) if (tokens[a + k] !== tokens[b + k]) return false
  return true
}

// Maior série de repetições consecutivas começando em `i` (n-grama que cobre mais palavras).
function bestRunAt(tokens: string[], i: number): RepetitionRun | null {
  let best: RepetitionRun | null = null
  for (let n = 1; n <= MAX_NGRAM && i + 2 * n <= tokens.length; n++) {
    if (!tokens[i]) break
    let count = 1
    while (i + (count + 1) * n <= tokens.length && sameNgram(tokens, i, i + count * n, n)) count++
    if (count >= minRepeats(n) && (!best || n * count > best.size * best.count)) best = { start: i, size: n, count }
  }
  return best
}

export function findRepetitionRuns(words: string[]): RepetitionRun[] {
  const tokens = words.map(normalizeToken)
  const runs: RepetitionRun[] = []
  for (let i = 0; i < tokens.length; ) {
    const run = bestRunAt(tokens, i)
    if (run) {
      runs.push(run)
      i += run.size * run.count
    } else i++
  }
  return runs
}

// `audioMs` (duração do áudio transcrito) habilita a checagem de taxa de fala.
export function guardSegment(text: string, audioMs?: number): GuardResult {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const runs = findRepetitionRuns(words)
  const covered = runs.reduce((n, r) => n + r.size * r.count, 0)
  const coverage = words.length ? covered / words.length : 0

  // Cada série anômala fica com uma única ocorrência; o restante do texto é preservado.
  const kept: string[] = []
  let next = 0
  for (const r of runs) {
    kept.push(...words.slice(next, r.start + r.size))
    next = r.start + r.size * r.count
  }
  kept.push(...words.slice(next))

  const rateTooHigh = !!audioMs && words.length >= MIN_WORDS_FOR_RATE && words.length / (audioMs / 1000) > MAX_WORDS_PER_SECOND
  const abnormal = runs.length > 0 || rateTooHigh
  return {
    text: kept.join(' '),
    abnormal,
    reason: runs.length ? 'repetition' : rateTooHigh ? 'rate' : null,
    runs,
    coverage,
  }
}
