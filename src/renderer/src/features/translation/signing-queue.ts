// Fila do avatar: FIFO ordenada, tradução integral.
// Nada é descartado automaticamente. Para não acumular atraso, a velocidade sobe com a fila
// e a fila se recupera nas pausas naturais da fala. Só o operador pode esvaziá-la (registrado).
import { createStore } from 'zustand/vanilla'
import type { CaptionLineState } from '../../../../shared/output'
import { countWords, nowMs } from '@/lib/telemetry'
import type { Player } from '../avatar/player'

const LAG_UP_MS = 4000 // atraso projetado acima disso: acelera
const LAG_DOWN_MS = 1500 // abaixo disso: volta ao normal (histerese evita oscilar)
const DEFAULT_MS_PER_WORD = 1000 // estimativa inicial (medida na auditoria a 2x); depois aprende
const MAX_SPEED = 2.5 // maior opção do player
const NO_PLAY_TIMEOUT_MS = 5000
const MAX_WORDS = 80 // proteção da fila contra segmentos anômalos
const MAX_ITEMS = 1000

export type QueueItemState = 'waiting' | 'playing' | 'done' | 'skipped' | 'failed'
export type QueueSource = 'voz' | 'texto' | 'frase' | 'repetição'

export interface QueueItem {
  seg: string
  text: string
  source: QueueSource
  state: QueueItemState
  enqueuedAt: number
  startedAt?: number
  endedAt?: number
  glossFallback?: boolean
}

interface Job {
  seg: string
  text: string
  words: number
  speechEnd: number
  gloss: Promise<string>
  startedAt?: number
}

export interface QueueState {
  items: QueueItem[]
  lagMs: number
  pending: number
  backlogMs: number
  speed: number
  active: boolean
}

export interface SigningQueueDeps {
  getPlayer(): Player | null
  translate(text: string): Promise<string>
  onCaptionState(seg: string, state: CaptionLineState): void
  baseSpeed(): number
  newSeg(): string
  tel(type: string, seg: string | null, data?: Record<string, unknown>): void
}

export class SigningQueue {
  readonly store = createStore<QueueState>(() => ({ items: [], lagMs: 0, pending: 0, backlogMs: 0, speed: 2, active: false }))
  private queue: Job[] = []
  private current: Job | null = null
  private busy = false
  private sawPlaying = false
  private busySince = 0
  private msPerWord = DEFAULT_MS_PER_WORD // média móvel observada (palavras em português × duração)
  private translateChain: Promise<unknown> = Promise.resolve()
  private speedBoosted = false
  private desiredSpeed = 2
  private lastLagTel = 0

  constructor(private readonly deps: SigningQueueDeps) {}

  start() {
    // 50ms: resolução da medição de início/fim da animação (o player só expõe `status`)
    const timers = [setInterval(() => void this.pump(), 50), setInterval(() => this.updateLag(), 250)]
    return () => timers.forEach(clearInterval)
  }

  private patchItem(seg: string, patch: Partial<QueueItem>) {
    this.store.setState((s) => ({ items: s.items.map((it) => (it.seg === seg ? { ...it, ...patch } : it)) }))
  }

  private setItemState(seg: string, state: QueueItemState, caption: CaptionLineState) {
    this.patchItem(seg, { state, ...(state === 'playing' ? { startedAt: nowMs() } : { endedAt: nowMs() }) })
    this.deps.onCaptionState(seg, caption)
  }

  // Idempotente por segmento: o mesmo final nunca entra duas vezes na fila.
  enqueue(text: string, seg: string, speechEnd = nowMs(), source: QueueSource = 'texto') {
    if (this.store.getState().items.some((it) => it.seg === seg)) return this.deps.tel('queue.duplicate', seg)
    const all = text.trim().split(/\s+/)
    const safe = all.length > MAX_WORDS ? all.slice(0, MAX_WORDS).join(' ') : text
    if (safe !== text) this.deps.tel('queue.truncated', seg, { words: all.length })
    const words = countWords(safe)
    this.deps.tel('recv', seg, { text: safe, words, depth: this.queue.length })
    // Já traduz texto → glosa enquanto o avatar ainda sinaliza o que veio antes
    this.queue.push({ seg, text: safe, words, speechEnd, gloss: this.pretranslate(safe, seg) })
    this.store.setState((s) => ({ items: [...s.items, { seg, text: safe, source, state: 'waiting' as const, enqueuedAt: nowMs() }].slice(-MAX_ITEMS) }))
    void this.pump()
  }

  // Esvaziamento manual pelo operador: cada item sai registrado (nunca em silêncio)
  flush() {
    for (const job of this.queue.splice(0)) this.dropJob(job, 'fila esvaziada pelo operador')
    this.updateLag()
  }

  cancel(seg: string) {
    const idx = this.queue.findIndex((j) => j.seg === seg)
    if (idx === -1) return
    const [job] = this.queue.splice(idx, 1)
    if (job) this.dropJob(job, 'cancelado pelo operador')
    this.updateLag()
  }

  private dropJob(job: Job, reason: string) {
    this.deps.tel('drop', job.seg, { reason, text: job.text })
    this.setItemState(job.seg, 'skipped', 'skipped')
  }

  // Interrompe o sinal em curso e segue para o próximo item.
  skipCurrent() {
    const job = this.current
    if (!job) return
    this.deps.tel('skip', job.seg)
    this.setItemState(job.seg, 'skipped', 'skipped')
    this.current = null
    this.busy = false
    this.deps.getPlayer()?.stop()
  }

  replay(seg: string) {
    const item = this.store.getState().items.find((it) => it.seg === seg)
    if (item) this.enqueue(item.text, this.deps.newSeg(), nowMs(), 'repetição')
  }

  clearFinished() {
    this.store.setState((s) => ({ items: s.items.filter((it) => it.state === 'waiting' || it.state === 'playing') }))
  }

  // Preserva a sessão ao alternar a saída do avatar: a frase em curso volta para a frente da fila.
  requeueCurrent(reason: string) {
    if (!this.current) return
    this.deps.tel('requeue', this.current.seg, { engine: reason })
    this.patchItem(this.current.seg, { state: 'waiting', startedAt: undefined })
    this.deps.onCaptionState(this.current.seg, 'pending')
    this.queue.unshift(this.current)
    this.current = null
    this.busy = false
  }

  // Traduções em SÉRIE, na ordem da fila: a glosa da frente nunca fica atrás de uma posterior.
  private pretranslate(text: string, seg: string) {
    const job = this.translateChain.then(async () => {
      this.deps.tel('gloss.req', seg)
      try {
        const gloss = await this.deps.translate(text)
        if (!gloss) throw new Error('glosa vazia')
        this.deps.tel('gloss.res', seg, { gloss, words: countWords(gloss) })
        return gloss
      } catch (e) {
        // sem glosa o player recebe o texto em português (registrado: vira datilologia/sinais errados)
        this.deps.tel('gloss.err', seg, { error: String((e as Error)?.message ?? e) })
        this.patchItem(seg, { glossFallback: true })
        return text
      }
    })
    this.translateChain = job
    return job
  }

  // Quanto falta sinalizar: restante do item atual + itens na fila, em ms estimados
  private backlogMs() {
    let ms = this.queue.reduce((n, it) => n + it.words * this.msPerWord, 0)
    if (this.current?.startedAt) ms += Math.max(0, this.current.words * this.msPerWord - (nowMs() - this.current.startedAt))
    return ms
  }

  // Atraso atual: há quanto tempo foi dita a fala que o avatar está (ou deveria estar) sinalizando
  private lagMs() {
    const ref = this.current ?? this.queue[0]
    return ref ? Math.max(0, nowMs() - ref.speechEnd) : 0
  }

  private chooseSpeed() {
    const projected = this.lagMs() + this.backlogMs()
    if (projected > LAG_UP_MS) this.speedBoosted = true
    else if (projected < LAG_DOWN_MS) this.speedBoosted = false
    const base = this.deps.baseSpeed()
    this.desiredSpeed = this.speedBoosted ? Math.min(MAX_SPEED, base + 0.5) : base
    return this.desiredSpeed
  }

  async pump() {
    const v = this.deps.getPlayer()
    if (!v) return
    const current = this.current
    if (this.busy && current) {
      if (v.status === 'playing' || v.status === 'paused') {
        if (!this.sawPlaying) {
          current.startedAt = nowMs()
          this.deps.tel('anim.start', current.seg)
          this.setItemState(current.seg, 'playing', 'signing')
        }
        this.sawPlaying = true
      } else if (this.sawPlaying || nowMs() - this.busySince > NO_PLAY_TIMEOUT_MS) {
        // ponytail: 5s de folga caso o player nunca reporte 'playing' (glosa vazia, erro)
        if (this.sawPlaying && current.startedAt) {
          const dur = nowMs() - current.startedAt
          if (current.words) this.msPerWord = 0.7 * this.msPerWord + 0.3 * (dur / current.words)
          this.deps.tel('anim.end', current.seg)
          this.setItemState(current.seg, 'done', 'done')
        } else {
          this.deps.tel('anim.timeout', current.seg)
          this.setItemState(current.seg, 'failed', 'done')
        }
        this.busy = false
        this.current = null
      }
      if (this.busy) return
    }
    if (this.busy || v.status !== 'idle') return
    const job = this.queue.shift()
    if (!job) return

    this.busy = true
    this.sawPlaying = false
    this.current = job
    this.busySince = Infinity // não expira enquanto aguarda a tradução
    const gloss = (await job.gloss) || job.text
    if (this.current !== job) return // motor trocado ou item pulado durante a tradução
    const player = this.deps.getPlayer()
    if (!player) return this.requeueCurrent('sem player')
    const speed = this.chooseSpeed()
    if (player.speed !== speed) {
      this.deps.tel('speed.change', job.seg, { from: player.speed, to: speed, lagMs: Math.round(this.lagMs()), backlogMs: Math.round(this.backlogMs()) })
      player.setSpeed(speed)
    }
    this.busySince = nowMs()
    this.deps.tel('play', job.seg, { speed, glossWords: countWords(gloss), depth: this.queue.length, lagMs: Math.round(this.lagMs()) })
    player.play(gloss)
  }

  private updateLag() {
    const lagMs = Math.round(this.lagMs())
    const pending = this.queue.length
    const active = this.busy || pending > 0
    const backlogMs = Math.round(this.backlogMs())
    const s = this.store.getState()
    if (s.lagMs !== lagMs || s.pending !== pending || s.speed !== this.desiredSpeed || s.active !== active || s.backlogMs !== backlogMs) {
      this.store.setState({ lagMs, pending, backlogMs, speed: this.desiredSpeed, active })
    }
    if (active && nowMs() - this.lastLagTel > 1000) {
      this.lastLagTel = nowMs()
      this.deps.tel('lag', null, { lagMs, pending, backlogMs, speed: this.desiredSpeed })
    }
  }
}
