// Motor de sinalização: uma única instância do Unity, no monitor do Studio, no Telão ou no Overlay.
import { createStore } from 'zustand/vanilla'
import type { Engine, PlayerStatus } from '../../../../shared/output'

export interface Player {
  readonly status: PlayerStatus | null
  readonly speed: number | null
  play(gloss: string): void
  setSpeed(speed: number): void
  setAvatar(name: string): void
  pause(): void
  resume(): void
  stop(): void
}

// API do player exposta por public/vlibras-stage.html.
declare global {
  interface Window {
    vlibras?: Player
  }
}

let engine: Engine = 'studio'
let stageFrame: HTMLIFrameElement | null = null

// Estado do player para a interface (lido em ~4 Hz, não a cada frame do Unity).
export const playerStore = createStore(() => ({ status: null as PlayerStatus | null }))

// Fora do Studio os comandos seguem por IPC e o estado volta da janela de saída.
const remote = {
  status: null as PlayerStatus | null,
  speed: null as number | null,
  play: (gloss: string) => window.sinalize.player.cmd('play', gloss),
  setSpeed(speed: number) {
    remote.speed = speed
    window.sinalize.player.cmd('setSpeed', speed)
  },
  setAvatar: (name: string) => window.sinalize.player.cmd('setAvatar', name),
  pause: () => window.sinalize.player.cmd('pause'),
  resume: () => window.sinalize.player.cmd('resume'),
  stop: () => window.sinalize.player.cmd('stop'),
} satisfies Player

export function watchPlayer() {
  const offRemote = window.sinalize.player.onStatus((s) => {
    remote.status = s.status
    remote.speed = s.speed
  })
  const timer = setInterval(() => {
    const status = getPlayer()?.status ?? null
    if (playerStore.getState().status !== status) playerStore.setState({ status })
  }, 250)
  return () => {
    offRemote()
    clearInterval(timer)
  }
}

export const setStageFrame = (frame: HTMLIFrameElement | null) => {
  stageFrame = frame
}

export function setEngine(next: Engine) {
  engine = next
  remote.status = null
}

export function getPlayer(): Player | null {
  if (engine !== 'studio') return remote
  try {
    return stageFrame?.contentWindow?.vlibras ?? null
  } catch {
    return null
  }
}
