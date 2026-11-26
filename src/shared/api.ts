// Superfície exposta pelo preload em window.sinalize e nomes dos canais IPC.
import type {
  ArgsOf,
  CaptionEvent,
  OverlayCommand,
  OverlayCommandArgs,
  OverlayKind,
  OverlayPatch,
  OverlayState,
  PlayerCommandArgs,
  PlayerMethod,
  PlayerState,
} from './overlay'

export const IPC = {
  telemetry: 'telemetry',
  diagOpen: 'diag:open',
  diagSnapshot: 'diag:snapshot',
  diagExport: 'diag:export',
  diagReset: 'diag:reset',
  translate: 'vlibras:translate',
  overlayGet: 'overlay:get',
  overlayUpdate: 'overlay:update',
  overlayCommand: 'overlay:command',
  overlayState: 'overlay:state',
  overlayFocus: 'overlay:focus',
  overlayShortcut: 'overlay:shortcut',
  playerCmd: 'player:cmd',
  playerStatus: 'player:status',
  captionEvent: 'caption:event',
} as const

export interface TelemetryEvent {
  t: number
  src: 'control' | 'avatar'
  type: string
  seg: string | null
  data?: Record<string, unknown>
}

export type Unsubscribe = () => void

export interface SinalizeApi {
  telemetry(ev: TelemetryEvent): void
  openDiagnostics(): void
  diag: {
    snapshot(): Promise<unknown>
    export(format: 'json' | 'csv'): Promise<string | null>
    reset(): Promise<void>
  }
  // Português → glosa pelo serviço do VLibras (feito no main: o serviço não envia CORS).
  translate(text: string): Promise<string>
  overlay: {
    get(): Promise<OverlayState>
    update(patch: OverlayPatch): Promise<OverlayState>
    command<C extends OverlayCommand>(cmd: C, ...arg: ArgsOf<OverlayCommandArgs[C]>): Promise<OverlayState>
    onState(cb: (state: OverlayState) => void): Unsubscribe
    onFocus(cb: (section: OverlayKind) => void): Unsubscribe
    onShortcut(cb: (action: 'toggleMic') => void): Unsubscribe
  }
  player: {
    cmd<M extends PlayerMethod>(method: M, ...arg: ArgsOf<PlayerCommandArgs[M]>): void
    onCmd(cb: <M extends PlayerMethod>(method: M, arg: PlayerCommandArgs[M]) => void): Unsubscribe
    status(state: PlayerState): void
    onStatus(cb: (state: PlayerState) => void): Unsubscribe
  }
  caption: {
    push(ev: CaptionEvent): void
    onEvent(cb: (ev: CaptionEvent) => void): Unsubscribe
  }
}
