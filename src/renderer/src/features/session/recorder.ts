// Captura contínua com detecção de fala (VAD por nível) e transcrição Whisper por segmento.
// Cada pausa fecha um segmento e abre o próximo sem interromper o microfone.
//
// Grafo de áudio: microfone → ganho → { analisador do VAD, analisador do medidor, gravação }.
// Ganho e mudo valem também para o que é transcrito.
import { createStore } from 'zustand/vanilla'
import { countWords, nowMs, tel as telemetry } from '@/lib/telemetry'
import { audioSettingsStore, type AudioSettings } from '../audio/audio-settings'
import { notify } from '../notify'
import { guardSegment } from '../transcription/segment-guard'
import { newSegId } from './segments'
import { setServerState } from './server-status'
import { HttpError, currentProvider, hasValidKey, sttStore, transcribe } from './stt'

const MIME = 'audio/webm;codecs=opus'
const MAX_SEGMENT_MS = 12000
const PARTIAL_MS = 300
const PARTIAL_TIMEOUT_MS = 3000
const VAD_TICK_MS = 50
// Temperatura da retentativa: reproduz o fallback que o servidor desliga (ver segment-guard.ts).
const RETRY_TEMPERATURE = 0.4

export type MicTone = 'idle' | 'live' | 'processing' | 'ok' | 'error'

export interface RecorderState {
  recording: boolean
  paused: boolean
  voiceActive: boolean
  micState: { message: string; tone: MicTone }
}

interface Segment {
  rec: MediaRecorder
  segId: string
  chunks: Blob[]
  hadVoice: boolean
  audioMs: number
  speechEnd: number
  rev: number
}

export interface RecorderDeps {
  expand(text: string): string
  onVoice(seg: string): void
  onPartial(seg: string, text: string, rev: number): void
  onProcessing(seg: string): void
  onFinal(seg: string, text: string, speechEnd: number, repaired: boolean): void
  onEmpty(seg: string): void
  onError(seg: string, message: string): void
}

type StartResult = 'ok' | 'needs-key' | 'mic-error' | 'busy'

const tel = (type: string, seg: string | null, data?: Record<string, unknown>) => telemetry('control', type, seg, data)
const isTimeout = (e: unknown) => (e as Error)?.name === 'AbortError' || (e as Error)?.message === 'timeout'

interface AudioGraph {
  ctx: AudioContext
  source: MediaStreamAudioSourceNode
  gain: GainNode
  vad: AnalyserNode
  meter: AnalyserNode
  dest: MediaStreamAudioDestinationNode
}

export class ContinuousRecorder {
  readonly store = createStore<RecorderState>(() => ({
    recording: false,
    paused: false,
    voiceActive: false,
    micState: { message: 'Microfone desligado', tone: 'idle' },
  }))

  private stream: MediaStream | null = null
  private graph: AudioGraph | null = null
  private segment: Segment | null = null
  private vadTimer: ReturnType<typeof setInterval> | undefined
  private starting = false
  private segmentStart = 0
  private lastVoiceAt = 0
  private heardVoice = false
  private lastPartialAt = 0
  private partialBusy = false
  private partialAbort: AbortController | null = null
  private finalsInFlight = 0
  private transcribeChain: Promise<void> = Promise.resolve()

  constructor(private readonly deps: RecorderDeps) {}

  get recording() {
    return this.store.getState().recording
  }

  get paused() {
    return this.store.getState().paused
  }

  // Analisador do medidor: o mixer lê direto em canvas, sem passar pelo React.
  get meterAnalyser() {
    return this.graph?.meter ?? null
  }

  private setMic(message: string, tone: MicTone = 'idle') {
    this.store.setState({ micState: { message, tone } })
  }

  private settings(): AudioSettings {
    return audioSettingsStore.getState()
  }

  private async openStream(deviceId: string) {
    return navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId === 'default' ? undefined : { exact: deviceId },
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })
  }

  private buildGraph(stream: MediaStream): AudioGraph {
    const ctx = new AudioContext()
    const source = ctx.createMediaStreamSource(stream)
    const gain = ctx.createGain()
    // Mesma calibração do VAD da v1 (fftSize 128, suavização 0,4).
    const vad = ctx.createAnalyser()
    vad.fftSize = 128
    vad.smoothingTimeConstant = 0.4
    const meter = ctx.createAnalyser()
    meter.fftSize = 2048
    meter.smoothingTimeConstant = 0
    const dest = ctx.createMediaStreamDestination()
    dest.channelCount = 1
    source.connect(gain)
    gain.connect(vad)
    gain.connect(meter)
    gain.connect(dest)
    return { ctx, source, gain, vad, meter, dest }
  }

  applyAudioSettings({ gain, muted }: AudioSettings) {
    if (this.graph) this.graph.gain.gain.value = muted ? 0 : gain
  }

  // Troca de microfone sem interromper a sessão: o gravador continua no mesmo destino do grafo.
  async switchDevice(deviceId: string) {
    if (!this.graph || !this.stream) return
    const next = await this.openStream(deviceId)
    const source = this.graph.ctx.createMediaStreamSource(next)
    this.graph.source.disconnect()
    source.connect(this.graph.gain)
    this.stream.getTracks().forEach((t) => t.stop())
    this.stream = next
    this.graph.source = source
    tel('mic.device', null, { label: next.getAudioTracks()[0]?.label ?? '' })
  }

  async start(): Promise<StartResult> {
    if (this.starting || this.recording) return 'busy'
    if (!hasValidKey()) {
      this.setMic('Chave OpenAI necessária', 'error')
      notify.error('Chave da OpenAI necessária', 'Informe a chave ou use o servidor local em Configurações › Reconhecimento de voz.')
      return 'needs-key'
    }
    this.starting = true
    try {
      this.stream = await this.openStream(this.settings().deviceId)
    } catch (e) {
      this.setMic('Microfone indisponível', 'error')
      notify.error('Microfone indisponível', (e as Error).message)
      return 'mic-error'
    } finally {
      this.starting = false
    }
    this.graph = this.buildGraph(this.stream)
    this.applyAudioSettings(this.settings())
    this.store.setState({ recording: true, paused: false })
    this.startSegment()
    this.vadTimer = setInterval(() => this.onVadTick(), VAD_TICK_MS)
    this.setMic('Ouvindo', 'live')
    return 'ok'
  }

  // Pausa a transcrição sem liberar o microfone (o medidor segue ativo).
  pause() {
    if (!this.recording || this.paused) return
    this.store.setState({ paused: true, voiceActive: false })
    this.cutSegment('pausa do operador')
    this.setMic('Captura pausada', 'idle')
  }

  resume() {
    if (!this.recording || !this.paused) return
    this.store.setState({ paused: false })
    this.startSegment()
    this.setMic('Ouvindo', 'live')
  }

  stop() {
    const stream = this.stream
    if (!this.recording || !stream) return
    const segment = this.segment
    this.store.setState({ recording: false, paused: false, voiceActive: false })
    clearInterval(this.vadTimer)
    const graph = this.graph
    this.stream = null
    this.graph = null
    // Libera microfone e áudio só depois do último pedaço gravado do segmento.
    const release = () => {
      stream.getTracks().forEach((t) => t.stop())
      void graph?.ctx.close()
    }
    if (segment && segment.rec.state !== 'inactive') {
      segment.rec.addEventListener('stop', release)
      this.cutSegment('parada')
    } else release()
    this.setMic('Microfone desligado')
  }

  private startSegment() {
    if (!this.graph) return
    const chunks: Blob[] = []
    const rec = new MediaRecorder(this.graph.dest.stream, { mimeType: MIME })
    const seg: Segment = { rec, segId: newSegId('mic'), chunks, hadVoice: false, audioMs: 0, speechEnd: 0, rev: 0 }
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
    this.segment = null
    seg.hadVoice = this.heardVoice
    seg.audioMs = Math.round(nowMs() - this.segmentStart)
    seg.speechEnd = this.lastVoiceAt
    if (this.heardVoice) tel('seg.cut', seg.segId, { cause, lastVoiceAt: this.lastVoiceAt, audioMs: seg.audioMs })
    this.partialAbort?.abort()
    if (this.recording && !this.paused) this.startSegment()
    seg.rec.stop()
  }

  private onVadTick() {
    const graph = this.graph
    const seg = this.segment
    if (!graph || !seg || this.paused) return
    const data = new Uint8Array(graph.vad.frequencyBinCount)
    graph.vad.getByteFrequencyData(data)
    const level = data.reduce((n, v) => n + v, 0) / data.length
    const { vadLevel, silenceMs } = this.settings()
    const now = nowMs()
    if (level > vadLevel) {
      if (!this.heardVoice) {
        tel('voice.on', seg.segId, { level: Math.round(level) })
        this.deps.onVoice(seg.segId)
      }
      this.heardVoice = true
      this.lastVoiceAt = now
    }
    const voiceActive = this.heardVoice && now - this.lastVoiceAt <= silenceMs
    if (voiceActive !== this.store.getState().voiceActive) this.store.setState({ voiceActive })
    const paused = this.heardVoice && now - this.lastVoiceAt > silenceMs
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
    const rev = ++seg.rev
    tel('partial.req', seg.segId, { audioMs, rev })
    const controller = new AbortController()
    this.partialAbort = controller
    try {
      const raw = await transcribe(new Blob(seg.chunks, { type: MIME }), PARTIAL_TIMEOUT_MS, controller)
      const ms = Math.round(nowMs() - this.lastPartialAt)
      if (!raw || seg !== this.segment || !this.recording) return tel('partial.stale', seg.segId, { ms, audioMs, rev })
      const guard = guardSegment(raw, audioMs)
      if (guard.abnormal) tel('asr.loop', seg.segId, { stage: 'partial', reason: guard.reason, coverage: guard.coverage, raw })
      const text = this.deps.expand(guard.text)
      tel('partial.res', seg.segId, { ms, audioMs, rev, words: countWords(text), text })
      this.deps.onPartial(seg.segId, text, rev)
    } catch (e) {
      tel(controller.signal.aborted ? 'partial.abort' : 'partial.err', seg.segId, { error: String((e as Error)?.message ?? e) })
    } finally {
      if (this.partialAbort === controller) this.partialAbort = null
      this.partialBusy = false
    }
  }

  // Loop detectado no final: uma retentativa com temperatura de fallback; se persistir, usa o texto colapsado.
  private async recoverLoop(blob: Blob, seg: Segment, raw: string, timeoutMs: number) {
    const first = guardSegment(raw, seg.audioMs)
    if (!first.abnormal) return { text: raw, repaired: false }
    tel('asr.loop', seg.segId, { stage: 'final', reason: first.reason, coverage: first.coverage, raw })
    try {
      const retry = await transcribe(blob, timeoutMs, undefined, RETRY_TEMPERATURE)
      const second = guardSegment(retry, seg.audioMs)
      if (retry && !second.abnormal) {
        tel('asr.recovered', seg.segId, { text: retry })
        return { text: retry, repaired: true }
      }
    } catch (e) {
      tel('asr.retry.err', seg.segId, { error: String((e as Error)?.message ?? e) })
    }
    tel('asr.repaired', seg.segId, { text: first.text })
    return { text: first.text, repaired: true }
  }

  private async transcribeAndSend(blob: Blob, seg: Segment) {
    const p = currentProvider()
    const local = !p.needsKey
    this.setMic('Transcrevendo', 'processing')
    this.deps.onProcessing(seg.segId)
    const t0 = nowMs()
    tel('final.req', seg.segId, { audioMs: seg.audioMs, provider: sttStore.getState().provider })
    this.finalsInFlight++
    const listening = () => this.setMic(this.recording ? (this.paused ? 'Captura pausada' : 'Ouvindo') : 'Microfone desligado', this.recording && !this.paused ? 'live' : 'idle')
    try {
      let raw: string
      try {
        raw = await transcribe(blob, p.finalTimeoutMs)
      } catch (e) {
        const status = e instanceof HttpError ? e.status : isTimeout(e) ? 'timeout' : 'rede'
        tel('final.err', seg.segId, { status, ms: Math.round(nowMs() - t0) })
        if (!(e instanceof HttpError)) throw e
        console.error('Transcrição erro:', e.status, e.body)
        this.setMic('Erro na transcrição: ' + e.status, 'error')
        this.deps.onError(seg.segId, `HTTP ${e.status}`)
        notify.error(local ? 'Falha no servidor local de transcrição' : 'Falha na transcrição da OpenAI', `HTTP ${e.status}`)
        return
      }

      if (local) setServerState('online')
      const { text, repaired } = raw ? await this.recoverLoop(blob, seg, raw, p.finalTimeoutMs) : { text: '', repaired: false }
      const ms = Math.round(nowMs() - t0)
      if (!text) {
        tel('final.empty', seg.segId, { ms, audioMs: seg.audioMs })
        this.deps.onEmpty(seg.segId)
        return listening()
      }
      tel('final.res', seg.segId, { ms, audioMs: seg.audioMs, text, words: countWords(text), repaired })
      listening()
      this.deps.onFinal(seg.segId, text, seg.speechEnd, repaired)
    } catch (e) {
      console.error('fetch falhou:', e)
      const lost = isTimeout(e) ? 'Transcrição demorou demais (frase perdida)' : null
      this.deps.onError(seg.segId, lost ?? 'Sem conexão')
      if (local) {
        setServerState('offline')
        this.setMic(lost ?? 'Servidor local indisponível', 'error')
      } else {
        this.setMic(lost ?? 'Erro de conexão', 'error')
        notify.error('Sem conexão com a OpenAI')
      }
    } finally {
      this.finalsInFlight--
    }
  }
}
