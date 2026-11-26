// Gravação contínua com detecção de fala (VAD por nível) e transcrição Whisper por segmento.
// Cada pausa fecha um segmento e abre o próximo sem interromper o microfone.
import { createStore } from '@/lib/store'
import { countWords, nowMs, tel as telemetry } from '@/lib/telemetry'
import { serverStore } from './server-status'
import { newSegId, setStatus } from './status'
import { HttpError, currentProvider, hasValidKey, sttStore, transcribe } from './stt'

const MIME = 'audio/webm;codecs=opus'
const VAD_LEVEL = 18
const SILENCE_MS = 700
const MAX_SEGMENT_MS = 12000
const PARTIAL_MS = 300
const PARTIAL_TIMEOUT_MS = 3000
const METER_MS = 50
export const LISTENING = 'Ouvindo... fale normalmente'

export type MicTone = 'idle' | 'recording' | 'processing' | 'ok' | 'error'

export interface RecorderState {
  recording: boolean
  micState: { message: string; tone: MicTone }
  transcript: string
}

interface Segment {
  rec: MediaRecorder
  segId: string
  chunks: Blob[]
  hadVoice: boolean
  audioMs: number
  speechEnd: number
}

export interface RecorderDeps {
  expand(text: string): string
  onPartial(seg: string, text: string): void
  onFinal(seg: string, text: string, speechEnd: number): void
}

const tel = (type: string, seg: string | null, data?: Record<string, unknown>) => telemetry('control', type, seg, data)
const isTimeout = (e: unknown) => (e as Error)?.name === 'AbortError' || (e as Error)?.message === 'timeout'

export class ContinuousRecorder {
  readonly store = createStore<RecorderState>({
    recording: false,
    micState: { message: 'Aguardando gravação', tone: 'idle' },
    transcript: '',
  })
  // Nível do microfone em 0–100, separado para só o medidor re-renderizar a 20 Hz.
  readonly level = createStore(0)

  private stream: MediaStream | null = null
  private segment: Segment | null = null
  private audioContext: AudioContext | null = null
  private meterTimer: ReturnType<typeof setInterval> | undefined
  private starting = false
  private segmentStart = 0
  private lastVoiceAt = 0
  private heardVoice = false
  private lastPartialAt = 0
  private partialBusy = false
  private partialAbort: AbortController | null = null
  private finalsInFlight = 0
  private transcribeChain: Promise<void> = Promise.resolve()
  private lastFinalText = ''

  constructor(private readonly deps: RecorderDeps) {}

  get recording() {
    return this.store.get().recording
  }

  private setMic(message: string, tone: MicTone = 'idle') {
    this.store.set((s) => ({ ...s, micState: { message, tone } }))
  }

  private showTranscript(partial: string | null) {
    const transcript = partial ? (this.lastFinalText ? this.lastFinalText + '\n' : '') + partial + ' …' : this.lastFinalText
    this.store.set((s) => ({ ...s, transcript }))
  }

  async start(): Promise<'ok' | 'needs-key' | 'mic-error' | 'busy'> {
    if (this.starting || this.recording) return 'busy'
    if (!hasValidKey()) {
      this.setMic('Chave OpenAI necessária', 'error')
      setStatus('Insira sua chave ou escolha o servidor local nas configurações', 'error')
      return 'needs-key'
    }
    this.starting = true
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
    } catch (e) {
      this.setMic('Microfone indisponível', 'error')
      setStatus('Permissão de microfone negada: ' + (e as Error).message, 'error')
      return 'mic-error'
    } finally {
      this.starting = false
    }
    this.store.set((s) => ({ ...s, recording: true }))
    this.startSegment()
    this.startMeter(this.stream)
    this.setMic(LISTENING, 'recording')
    setStatus('Cada pausa na fala envia uma frase ao avatar')
    return 'ok'
  }

  stop() {
    const stream = this.stream
    const segment = this.segment
    if (!this.recording || !stream || !segment) return
    this.store.set((s) => ({ ...s, recording: false }))
    this.stopMeter()
    this.stream = null
    // Libera o microfone só depois do último pedaço de áudio do segmento.
    segment.rec.addEventListener('stop', () => stream.getTracks().forEach((t) => t.stop()))
    this.cutSegment('parada')
    this.setMic('Gravação encerrada')
  }

  private startSegment() {
    if (!this.stream) return
    const chunks: Blob[] = []
    const rec = new MediaRecorder(this.stream, { mimeType: MIME })
    const seg: Segment = { rec, segId: newSegId('mic'), chunks, hadVoice: false, audioMs: 0, speechEnd: 0 }
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    rec.onstop = () => {
      if (!seg.hadVoice || chunks.length === 0) return
      const blob = new Blob(chunks, { type: MIME })
      this.transcribeChain = this.transcribeChain.then(() => this.transcribeAndSend(blob, seg))
    }
    rec.start(250)
    this.segment = seg
    this.segmentStart = nowMs()
    this.heardVoice = false
    tel('seg.open', seg.segId)
  }

  private cutSegment(cause: string) {
    const seg = this.segment
    if (!seg) return
    seg.hadVoice = this.heardVoice
    seg.audioMs = Math.round(nowMs() - this.segmentStart)
    seg.speechEnd = this.lastVoiceAt
    if (this.heardVoice) tel('seg.cut', seg.segId, { cause, lastVoiceAt: this.lastVoiceAt, audioMs: seg.audioMs })
    this.partialAbort?.abort()
    if (this.recording) this.startSegment()
    seg.rec.stop()
  }

  private onAudioLevel(level: number) {
    const seg = this.segment
    if (!this.recording || !seg) return
    const now = nowMs()
    if (level > VAD_LEVEL) {
      if (!this.heardVoice) tel('voice.on', seg.segId, { level: Math.round(level) })
      this.heardVoice = true
      this.lastVoiceAt = now
    }
    const paused = this.heardVoice && now - this.lastVoiceAt > SILENCE_MS
    if (paused || now - this.segmentStart > MAX_SEGMENT_MS) this.cutSegment(paused ? 'pausa' : 'limite de duração')
    // Parciais só no servidor local: na OpenAI cada parcial seria uma requisição paga.
    else if (this.heardVoice && !this.partialBusy && !this.finalsInFlight && now - this.lastPartialAt > PARTIAL_MS && !currentProvider().needsKey) {
      void this.sendPartial(seg)
    }
  }

  private async sendPartial(seg: Segment) {
    this.partialBusy = true
    this.lastPartialAt = nowMs()
    const audioMs = Math.round(this.lastPartialAt - this.segmentStart)
    tel('partial.req', seg.segId, { audioMs })
    const controller = new AbortController()
    this.partialAbort = controller
    try {
      const text = await transcribe(new Blob(seg.chunks, { type: MIME }), PARTIAL_TIMEOUT_MS, controller)
      const ms = Math.round(nowMs() - this.lastPartialAt)
      if (text && seg === this.segment && this.recording) {
        const expanded = this.deps.expand(text)
        tel('partial.res', seg.segId, { ms, audioMs, words: countWords(expanded), text: expanded })
        this.showTranscript(expanded)
        this.deps.onPartial(seg.segId, expanded)
      } else {
        tel('partial.stale', seg.segId, { ms, audioMs })
      }
    } catch (e) {
      tel(controller.signal.aborted ? 'partial.abort' : 'partial.err', seg.segId, { error: String((e as Error)?.message ?? e) })
    } finally {
      if (this.partialAbort === controller) this.partialAbort = null
      this.partialBusy = false
    }
  }

  private async transcribeAndSend(blob: Blob, seg: Segment) {
    const p = currentProvider()
    const local = !p.needsKey
    this.setMic('Transcrevendo...', 'processing')
    const t0 = nowMs()
    tel('final.req', seg.segId, { audioMs: seg.audioMs, provider: sttStore.get().provider })
    this.finalsInFlight++
    try {
      let text: string
      try {
        text = await transcribe(blob, p.finalTimeoutMs)
      } catch (e) {
        const status = e instanceof HttpError ? e.status : isTimeout(e) ? 'timeout' : 'rede'
        tel('final.err', seg.segId, { status, ms: Math.round(nowMs() - t0) })
        if (!(e instanceof HttpError)) throw e
        console.error('Transcrição erro:', e.status, e.body)
        this.setMic('Erro na transcrição: ' + e.status, 'error')
        setStatus(local ? 'Falha no servidor local' : 'Falha na transcrição da OpenAI', 'error')
        return
      }

      const ms = Math.round(nowMs() - t0)
      if (local) serverStore.set('online')
      if (!text) {
        tel('final.empty', seg.segId, { ms, audioMs: seg.audioMs })
        this.setMic(this.recording ? LISTENING : 'Nenhum texto reconhecido', this.recording ? 'recording' : 'idle')
        return
      }

      tel('final.res', seg.segId, { ms, audioMs: seg.audioMs, text, words: countWords(text) })
      this.lastFinalText = text
      this.showTranscript(null)
      this.setMic(this.recording ? LISTENING : 'Transcrição concluída', this.recording ? 'recording' : 'ok')
      this.deps.onFinal(seg.segId, text, seg.speechEnd)
    } catch (e) {
      console.error('fetch falhou:', e)
      const lost = isTimeout(e) ? 'Transcrição demorou demais (frase perdida)' : null
      if (local) {
        serverStore.set('offline')
        this.setMic(lost ?? 'Servidor local indisponível', 'error')
        setStatus('Pronto')
      } else {
        this.setMic(lost ?? 'Erro de conexão', 'error')
        setStatus('Sem conexão com a OpenAI', 'error')
      }
    } finally {
      this.finalsInFlight--
    }
  }

  private startMeter(stream: MediaStream) {
    try {
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0.4
      ctx.createMediaStreamSource(stream).connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      this.audioContext = ctx
      this.meterTimer = setInterval(() => {
        analyser.getByteFrequencyData(data)
        const avg = data.reduce((n, v) => n + v, 0) / data.length
        this.level.set(Math.max(2, Math.min(100, Math.round(avg))))
        this.onAudioLevel(avg)
      }, METER_MS)
    } catch (err) {
      // Sem medidor não há VAD: todo segmento é tratado como fala.
      console.warn('Web Audio indisponível:', err)
      this.heardVoice = true
    }
  }

  private stopMeter() {
    clearInterval(this.meterTimer)
    this.level.set(0)
    if (this.audioContext && this.audioContext.state !== 'closed') void this.audioContext.close()
    this.audioContext = null
  }
}
