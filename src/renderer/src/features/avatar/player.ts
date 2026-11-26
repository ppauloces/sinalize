// Motor de sinalização: uma única instância do Unity, no palco do Studio ou na janela do overlay.
import type { Engine, PlayerStatus } from '../../../../shared/overlay'

export interface Player {
  readonly status: PlayerStatus | null
  readonly speed: number | null
  play(gloss: string): void
  setSpeed(speed: number): void
  setAvatar(name: string): void
}

// API do player exposta por public/vlibras-stage.html.
declare global {
  interface Window {
    vlibras?: Player
  }
}

let engine: Engine = 'studio'
let stageFrame: HTMLIFrameElement | null = null

// No overlay os comandos seguem por IPC e o estado volta da janela do avatar.
const remote = {
  status: null as PlayerStatus | null,
  speed: null as number | null,
  play: (gloss: string) => window.sinalize.player.cmd('play', gloss),
  setSpeed(speed: number) {
    remote.speed = speed
    window.sinalize.player.cmd('setSpeed', speed)
  },
  setAvatar: (name: string) => window.sinalize.player.cmd('setAvatar', name),
} satisfies Player

export function listenRemoteStatus() {
  return window.sinalize.player.onStatus((s) => {
    remote.status = s.status
    remote.speed = s.speed
  })
}

export const setStageFrame = (frame: HTMLIFrameElement | null) => {
  stageFrame = frame
}

export function setEngine(next: Engine) {
  engine = next
  remote.status = null
}

export function getPlayer(): Player | null {
  if (engine === 'overlay') return remote
  try {
    return stageFrame?.contentWindow?.vlibras ?? null
  } catch {
    return null
  }
}
