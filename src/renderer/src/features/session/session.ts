// Sessão única do Studio: microfone → transcrição → glossário → legenda + fila de sinalização.
// O overlay só consome saídas desta sessão; nada aqui é recriado ao alternar os modos.
import type { Engine } from '../../../../shared/overlay'
import { createStore } from '@/lib/store'
import { countWords, nowMs, tel } from '@/lib/telemetry'
import { getPlayer, listenRemoteStatus, setEngine } from '../avatar/player'
import { SigningQueue } from '../avatar/signing-queue'
import { CaptionStore } from '../captions/caption-store'
import { expand } from '../glossary/glossary'
import { initOverlayState, overlayCommand, overlayStore } from '../overlay/overlay-store'
import { ContinuousRecorder } from './recorder'
import { watchLocalServer } from './server-status'
import { newSegId, setStatus } from './status'

export const captions = new CaptionStore((ev) => window.sinalize.caption.push(ev))

export const queue = new SigningQueue({
  getPlayer,
  translate: (text) => window.sinalize.translate(text),
  onCaptionState: (seg, state) => captions.mark(seg, state),
  baseSpeed: () => overlayStore.get()?.settings.avatar.speed ?? 2,
  tel: (type, seg, data) => tel('avatar', type, seg, data),
})

export const recorder = new ContinuousRecorder({
  expand,
  onPartial: (seg, text) => captions.setPartial(seg, text),
  onFinal: (seg, text, speechEnd) => send(text, seg, speechEnd),
})

// Últimas traduções (máximo 3, sem repetição)
export const recentStore = createStore<string[]>([])

// Abre a gaveta de configurações e destaca a chave quando a gravação exige uma.
export const uiStore = createStore({ settingsOpen: false, keyAttention: 0 })

export function send(text: string, seg = newSegId('txt'), speechEnd = nowMs()) {
  const clean = text.trim()
  if (!clean) return
  // Pré-processamento obrigatório pelo glossário antes do VLibras
  const expanded = expand(clean)
  tel('control', 'sent', seg, { text: expanded, words: countWords(expanded) })
  captions.addFinal(seg, expanded)
  queue.enqueue(expanded, seg, speechEnd)
  setStatus(expanded !== clean ? `Glossário aplicado → "${expanded}"` : `Traduzindo: "${expanded}"`, 'active')
  recentStore.set((r) => [clean, ...r.filter((x) => x !== clean)].slice(0, 3))
}

export async function toggleMic() {
  if (recorder.recording) return recorder.stop()
  const result = await recorder.start()
  if (result === 'needs-key') uiStore.set((u) => ({ settingsOpen: true, keyAttention: u.keyAttention + 1 }))
  const overlay = overlayStore.get()
  if (result === 'ok' && overlay?.settings.behavior.autoStart && !overlay.active) void overlayCommand('open')
}

export function flushQueue() {
  if (confirm('Esvaziar a fila do avatar? As frases pendentes continuam na legenda, mas não serão sinalizadas.')) queue.flush()
}

// Liga timers e assinaturas da sessão; devolve o cleanup.
export function startSession() {
  let engine: Engine = 'studio'
  let character: string | null = null
  const offEngine = overlayStore.subscribe(() => {
    const s = overlayStore.get()
    if (!s) return
    if (s.engine !== engine) {
      engine = s.engine
      queue.requeueCurrent(engine)
      setEngine(engine)
    }
    if (s.settings.avatar.character !== character) {
      character = s.settings.avatar.character
      getPlayer()?.setAvatar(character)
    }
  })
  const cleanups = [
    queue.start(),
    listenRemoteStatus(),
    initOverlayState(),
    offEngine,
    watchLocalServer(() => recorder.recording),
    // Atalho global de captura: funciona com o PowerPoint em primeiro plano.
    window.sinalize.overlay.onShortcut((action) => {
      if (action === 'toggleMic') void toggleMic()
    }),
  ]
  return () => cleanups.forEach((off) => off())
}
