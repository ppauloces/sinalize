// Fila do avatar: FIFO ordenada, tradução integral.
// Nada é descartado automaticamente. Para não acumular atraso, a velocidade sobe com a fila
// e a fila se recupera nas pausas naturais da fala. Só o operador pode esvaziá-la (registrado).
import type { CaptionLineState } from '../../../../shared/overlay'
import { createStore } from '@/lib/store'
import { countWords, nowMs } from '@/lib/telemetry'
import type { Player } from './player'

const LAG_UP_MS = 4000 // atraso projetado acima disso: acelera
const LAG_DOWN_MS = 1500 // abaixo disso: volta ao normal (histerese evita oscilar)
const DEFAULT_MS_PER_WORD = 1000 // estimativa inicial (medida na auditoria a 2x); depois aprende
const MAX_SPEED = 2.5 // maior opção do player
const NO_PLAY_TIMEOUT_MS = 5000

interface QueueItem {
  seg: string
  text: string
  words: number
  speechEnd: number
  gloss: Promise<string>
  startedAt?: number
}

export interface QueueSnapshot {
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
  tel(type: string, seg: string | null, data?: Record<string, unknown>): void
}

export class SigningQueue {
  readonly store = createStore<QueueSnapshot>({ lagMs: 0, pending: 0, backlogMs: 0, speed: 2, active: false })
  private queue: QueueItem[] = []
  private current: QueueItem | null = null
  private busy = false
  private sawPlaying = false
  private busySince = 0
  private msPerWord = DEFAULT_MS_PER_WORD // média móvel observada (palavras em português × duração)
  private translateChain: Promise<unknown> = Promise.resolve()
  private speedBoosted = false
  private desiredSpeed = 2
  private lastLagTel = 0
  private timers: ReturnType<typeof setInterval>[] = []

  constructor(private readonly deps: SigningQueueDeps) {}

  start() {
    // 50ms: resolução da medição de início/fim da animação (o player só expõe `status`)
    this.timers = [setInterval(() => void this.pump(), 50), setInterval(() => this.updateLag(), 250)]
    return () => this.timers.forEach(clearInterval)
  }

  enqueue(text: string, seg: string, speechEnd = nowMs()) {
    const words = countWords(text)
    this.deps.tel('recv', seg, { text, words, depth: this.queue.length })
    // Já traduz texto → glosa enquanto o avatar ainda sinaliza o que veio antes
    this.queue.push({ seg, text, words, speechEnd, gloss: this.pretranslate(text, seg) })
    void this.pump()
  }

  // Esvaziamento manual pelo operador: cada item sai registrado (nunca em silêncio)
  flush() {
    for (const item of this.queue.splice(0)) {
      this.deps.tel('drop', item.seg, { reason: 'fila esvaziada pelo operador', text: item.text })
      this.deps.onCaptionState(item.seg, 'skipped')
    }
    this.updateLag()
  }

  // Preserva a sessão ao alternar a saída do avatar: a frase em curso volta para a frente da fila.
  requeueCurrent(reason: string) {
    if (!this.current) return
    this.deps.tel('requeue', this.current.seg, { engine: reason })
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
          this.deps.onCaptionState(current.seg, 'signing')
        }
        this.sawPlaying = true
      } else if (this.sawPlaying || nowMs() - this.busySince > NO_PLAY_TIMEOUT_MS) {
        // ponytail: 5s de folga caso o player nunca reporte 'playing' (glosa vazia, erro)
        if (this.sawPlaying && current.startedAt) {
          const dur = nowMs() - current.startedAt
          if (current.words) this.msPerWord = 0.7 * this.msPerWord + 0.3 * (dur / current.words)
          this.deps.tel('anim.end', current.seg)
        } else {
          this.deps.tel('anim.timeout', current.seg)
        }
        this.deps.onCaptionState(current.seg, 'done')
        this.busy = false
        this.current = null
      }
      if (this.busy) return
    }
    if (this.busy || v.status !== 'idle') return
    const item = this.queue.shift()
    if (!item) return

    this.busy = true
    this.sawPlaying = false
    this.current = item
    this.busySince = Infinity // não expira enquanto aguarda a tradução
    const gloss = (await item.gloss) || item.text
    if (this.current !== item) return // motor trocado durante a tradução: o item já voltou para a fila
    const player = this.deps.getPlayer()
    if (!player) {
      this.requeueCurrent('sem player')
      return
    }
    const speed = this.chooseSpeed()
    if (player.speed !== speed) {
      this.deps.tel('speed.change', item.seg, {
        from: player.speed,
        to: speed,
        lagMs: Math.round(this.lagMs()),
        backlogMs: Math.round(this.backlogMs()),
      })
      player.setSpeed(speed)
    }
    this.busySince = nowMs()
    this.deps.tel('play', item.seg, { speed, glossWords: countWords(gloss), depth: this.queue.length, lagMs: Math.round(this.lagMs()) })
    player.play(gloss)
  }

  private updateLag() {
    const lagMs = Math.round(this.lagMs())
    const pending = this.queue.length
    const active = this.busy || pending > 0
    const snapshot: QueueSnapshot = { lagMs, pending, backlogMs: Math.round(this.backlogMs()), speed: this.desiredSpeed, active }
    const prev = this.store.get()
    if (prev.lagMs !== lagMs || prev.pending !== pending || prev.speed !== snapshot.speed || prev.active !== active || prev.backlogMs !== snapshot.backlogMs) {
      this.store.set(snapshot)
    }
    if (active && nowMs() - this.lastLagTel > 1000) {
      this.lastLagTel = nowMs()
      this.deps.tel('lag', null, { lagMs, pending, backlogMs: snapshot.backlogMs, speed: snapshot.speed })
    }
  }
}
