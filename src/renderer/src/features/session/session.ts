// Sessão única do Studio: microfone → transcrição → glossário → legenda + fila de sinalização.
// As saídas (Telão e Overlay) só consomem esta sessão; nada aqui é recriado ao alternar módulos ou saídas.
import type { Engine } from '../../../../shared/output'
import { countWords, nowMs, tel } from '@/lib/telemetry'
import { audioSettingsStore } from '../audio/audio-settings'
import { getPlayer, setEngine, watchPlayer } from '../avatar/player'
import { CaptionStore } from '../captions/caption-store'
import { expand } from '../glossary/glossary'
import { notify } from '../notify'
import { outputCommand, outputStore, watchOutputState } from '../output/output-store'
import { transcript } from '../transcription/transcript-store'
import { SigningQueue, type QueueSource } from '../translation/signing-queue'
import { ContinuousRecorder } from './recorder'
import { newSegId } from './segments'
import { watchLocalServer } from './server-status'
import { workspace } from '../workspace/workspace-store'
import { sessionClock } from './session-store'

export const captions = new CaptionStore((ev) => window.sinalize.caption.push(ev))

export const queue = new SigningQueue({
  getPlayer,
  translate: (text) => window.sinalize.translate(text),
  onCaptionState: (seg, state) => captions.mark(seg, state),
  baseSpeed: () => outputStore.getState().state?.settings.avatar.speed ?? 2,
  newSeg: () => newSegId('txt'),
  tel: (type, seg, data) => tel('avatar', type, seg, data),
})

export const recorder = new ContinuousRecorder({
  expand,
  onVoice: (seg) => transcript.voice(seg),
  onPartial: (seg, text, rev) => {
    if (transcript.partial(seg, text, rev)) captions.setPartial(seg, text)
  },
  onProcessing: (seg) => transcript.processing(seg),
  onFinal: (seg, text, speechEnd, repaired) => {
    // Idempotência: um final repetido do mesmo segmento não chega à legenda nem à fila.
    if (!transcript.final(seg, text, repaired)) return tel('control', 'final.duplicate', seg)
    send(text, seg, speechEnd, 'voz')
  },
  onEmpty: (seg) => transcript.empty(seg),
  onError: (seg, message) => transcript.error(seg, message),
})

export function send(text: string, seg = newSegId('txt'), speechEnd = nowMs(), source: QueueSource = 'texto') {
  const clean = text.trim()
  if (!clean) return
  // Pré-processamento obrigatório pelo glossário antes do VLibras
  const expanded = expand(clean)
  tel('control', 'sent', seg, { text: expanded, words: countWords(expanded), source })
  captions.addFinal(seg, expanded)
  queue.enqueue(expanded, seg, speechEnd, source)
}

export async function startSession() {
  if (recorder.recording) return
  const result = await recorder.start()
  if (result === 'needs-key') return workspace.openSettings('speech')
  if (result !== 'ok') return
  sessionClock.start()
  const outputs = outputStore.getState().state
  if (outputs?.settings.behavior.autoStart && !outputs.overlayActive) void outputCommand('openOverlay')
}

export function stopSession() {
  if (!recorder.recording) return
  recorder.stop()
  sessionClock.stop()
  notify.info('Sessão encerrada', 'A fila de sinalização continua até a última frase.')
}

export function togglePause() {
  if (!recorder.recording) return
  if (recorder.paused) {
    recorder.resume()
    sessionClock.resume()
  } else {
    recorder.pause()
    sessionClock.pause()
  }
}

export const toggleSession = () => (recorder.recording ? stopSession() : void startSession())

// Liga timers e assinaturas da sessão; devolve o cleanup.
export function startStudio() {
  let engine: Engine = 'studio'
  let character: string | null = null
  const offOutputs = outputStore.subscribe(({ state }) => {
    if (!state) return
    if (state.engine !== engine) {
      engine = state.engine
      queue.requeueCurrent(engine)
      setEngine(engine)
    }
    if (state.settings.avatar.character !== character) {
      character = state.settings.avatar.character
      getPlayer()?.setAvatar(character)
    }
  })
  const offAudio = audioSettingsStore.subscribe((s, prev) => {
    recorder.applyAudioSettings(s)
    if (s.deviceId !== prev.deviceId) recorder.switchDevice(s.deviceId).catch((e) => notify.error('Falha ao trocar o microfone', String(e?.message ?? e)))
  })
  const cleanups = [
    queue.start(),
    watchPlayer(),
    watchOutputState(),
    offOutputs,
    offAudio,
    watchLocalServer(() => recorder.recording),
    // Atalho global de captura: funciona com o PowerPoint em primeiro plano.
    window.sinalize.output.onShortcut((action) => {
      if (action === 'toggleMic') toggleSession()
    }),
    () => recorder.stop(),
  ]
  return () => cleanups.forEach((off) => off())
}

