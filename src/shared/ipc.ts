// Superfície exposta pelo preload em window.sinalize e nomes dos canais IPC.
import type {
  ArgsOf,
  CaptionEvent,
  OutputCommand,
  OutputCommandArgs,
  OutputPatch,
  OutputState,
  OverlayKind,
  PlayerCommandArgs,
  PlayerMethod,
  PlayerState,
} from './output'
import type { SystemMetrics } from './schemas'

export const IPC = {
  telemetry: 'telemetry',
  diagSnapshot: 'diag:snapshot',
  diagExport: 'diag:export',
  diagReset: 'diag:reset',
  systemMetrics: 'system:metrics',
  appInfo: 'app:info',
  windowTheme: 'window:theme',
  translate: 'vlibras:translate',
  outputGet: 'output:get',
  outputUpdate: 'output:update',
  outputCommand: 'output:command',
  outputState: 'output:state',
  outputFocus: 'output:focus',
  outputShortcut: 'output:shortcut',
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

export interface AppInfo {
  version: string
  electron: string
  platform: string
}

export type Unsubscribe = () => void

export interface SinalizeApi {
  telemetry(ev: TelemetryEvent): void
  diag: {
    snapshot(): Promise<DiagnosticsSnapshot>
    export(format: 'json' | 'csv'): Promise<string | null>
    reset(): Promise<void>
  }
  system: {
    onMetrics(cb: (metrics: SystemMetrics) => void): Unsubscribe
  }
  app: {
    info(): Promise<AppInfo>
    setTheme(theme: 'dark' | 'light'): void
  }
  // Português → glosa pelo serviço do VLibras (feito no main: o serviço não envia CORS).
  translate(text: string): Promise<string>
  output: {
    get(): Promise<OutputState>
    update(patch: OutputPatch): Promise<OutputState>
    command<C extends OutputCommand>(cmd: C, ...arg: ArgsOf<OutputCommandArgs[C]>): Promise<OutputState>
    onState(cb: (state: OutputState) => void): Unsubscribe
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

// Resposta de diag:snapshot (métricas derivadas da telemetria, ver src/main/services/telemetry.ts).
export interface PercentileRow {
  n: number
  p50: number | null
  p95: number | null
  p99: number | null
}

export interface DiagnosticsSegment {
  seg: string
  t: number
  status: string
  text: string
  words: number
  e2eMs: number | null
  asrFinalMs: number | null
  glossMs: number | null
  queueWaitMs: number | null
  animDurMs: number | null
  speed: number | null
  partials: number
  dropReason: string | null
}

export interface DiagnosticsSnapshot {
  now: number
  summary: {
    counts: { segments: number; signed: number; dropped: number; asrErrors: number; partials: number; speedChanges: number; asrLoops: number }
    lag: { current: number; p50: number | null; p95: number | null; max: number | null; speed: number | null }
    percentiles: Record<string, PercentileRow>
    wpm: number | null
    pendingBlocks: number
    queueEstimateMs: number | null
    msPerWord: number | null
    retranscribeFactorAvg: number | null
  }
  metrics: Record<string, string>
  segments: DiagnosticsSegment[]
  system: SystemMetrics | null
}
