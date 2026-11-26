// Contratos das saídas de apresentação (Telão e Overlay) compartilhados entre main, preload e renderer.

export const ANCHORS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center', 'bottom-center', 'custom'] as const
export const AVATARS = ['icaro', 'hosana', 'guga'] as const
export const FONTS = ['Inter', 'Geist', 'Segoe UI', 'Arial', 'Verdana'] as const
export const CAPTION_SOURCES = ['live', 'final', 'signing'] as const
export const SHORTCUT_ACTIONS = ['toggleOverlay', 'toggleEdit', 'toggleAvatar', 'toggleCaption', 'resetLayout', 'toggleMic'] as const
export const OVERLAY_KINDS = ['avatar', 'caption'] as const
export const ENGINES = ['studio', 'presentation', 'overlay'] as const

export type Anchor = (typeof ANCHORS)[number]
export type AvatarName = (typeof AVATARS)[number]
export type FontFamily = (typeof FONTS)[number]
export type CaptionSource = (typeof CAPTION_SOURCES)[number]
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number]
export type OverlayKind = (typeof OVERLAY_KINDS)[number]
// Onde o único Unity ativo está renderizando o avatar.
export type Engine = (typeof ENGINES)[number]

// Proporção do palco do avatar (altura / largura): redimensiona sem distorcer o personagem.
export const AVATAR_RATIO = 420 / 320
export const DEFAULT_ANCHOR: Record<OverlayKind, Anchor> = { avatar: 'bottom-right', caption: 'bottom-center' }

export const AVATAR_LABELS: Record<AvatarName, string> = { icaro: 'Ícaro', hosana: 'Hosana', guga: 'Guga' }

export interface Placement {
  displayId: number | null
  anchor: Anchor
  x: number | null
  y: number | null
}

export interface AvatarSettings extends Placement {
  visible: boolean
  character: AvatarName
  width: number
  speed: number
  alwaysOnTop: boolean
}

export interface CaptionSettings extends Placement {
  visible: boolean
  source: CaptionSource
  fontFamily: FontFamily
  fontSize: number
  fontWeight: number
  color: string
  bgColor: string
  bgOpacity: number
  outline: boolean
  shadow: boolean
  maxWidth: number
  lineHeight: number
  maxLines: number
  holdMs: number
}

export interface BehaviorSettings {
  clickThrough: boolean
  restoreLast: boolean
  autoStart: boolean
  useFullBounds: boolean
}

// Telão: janela dedicada de projeção, sem nenhum controle técnico.
export interface PresentationSettings {
  displayId: number | null
  fullscreen: boolean
  background: string
  showCaptions: boolean
  captionSize: number
  showBranding: boolean
}

export type Shortcuts = Record<ShortcutAction, string>

export interface PresetSnapshot {
  avatar: AvatarSettings
  caption: CaptionSettings
}

export interface OutputSettings {
  avatar: AvatarSettings
  caption: CaptionSettings
  behavior: BehaviorSettings
  presentation: PresentationSettings
  shortcuts: Shortcuts
  customPresets: Record<string, PresetSnapshot>
}

export interface OutputPatch {
  avatar?: Partial<AvatarSettings>
  caption?: Partial<CaptionSettings>
  behavior?: Partial<BehaviorSettings>
  presentation?: Partial<PresentationSettings>
  shortcuts?: Partial<Shortcuts>
  customPresets?: Record<string, Partial<PresetSnapshot>>
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface ResolvedBounds extends Rect {
  displayId: number
}

export interface DisplayInfo {
  id: number
  label: string
  bounds: Rect
  workArea: Rect
  scaleFactor: number
  primary: boolean
}

export interface PresetInfo {
  id: string
  label: string
  builtin: boolean
}

export interface OutputState {
  settings: OutputSettings
  overlayActive: boolean
  editing: boolean
  presentationOpen: boolean
  engine: Engine
  displays: DisplayInfo[]
  bounds: Record<OverlayKind, ResolvedBounds>
  presets: PresetInfo[]
  shortcutFailures: ShortcutAction[]
}

// output:command — comando → tipo do argumento (validado em runtime no main).
export interface OutputCommandArgs {
  openOverlay: undefined
  closeOverlay: undefined
  toggleOverlay: undefined
  edit: boolean
  toggleEdit: undefined
  reset: undefined
  toggleAvatar: undefined
  toggleCaption: undefined
  applyPreset: string
  savePreset: string
  deletePreset: string
  nextDisplay: OverlayKind
  focusStudio: OverlayKind
  resizeAvatar: number
  resizeCaption: number
  togglePresentation: undefined
  setEngine: Engine
}
export type OutputCommand = keyof OutputCommandArgs

type TypeName = 'undefined' | 'boolean' | 'string' | 'number'
export const OUTPUT_COMMAND_TYPES = {
  openOverlay: 'undefined',
  closeOverlay: 'undefined',
  toggleOverlay: 'undefined',
  edit: 'boolean',
  toggleEdit: 'undefined',
  reset: 'undefined',
  toggleAvatar: 'undefined',
  toggleCaption: 'undefined',
  applyPreset: 'string',
  savePreset: 'string',
  deletePreset: 'string',
  nextDisplay: 'string',
  focusStudio: 'string',
  resizeAvatar: 'number',
  resizeCaption: 'number',
  togglePresentation: 'undefined',
  setEngine: 'string',
} as const satisfies Record<OutputCommand, TypeName>

// Motor de sinalização: o Studio comanda o Unity da saída ativa.
export type PlayerStatus = 'idle' | 'playing' | 'paused'

export interface PlayerState {
  status: PlayerStatus | null
  speed: number | null
}

export interface PlayerCommandArgs {
  play: string
  setSpeed: number
  setAvatar: string
  pause: undefined
  resume: undefined
  stop: undefined
}
export type PlayerMethod = keyof PlayerCommandArgs

export const PLAYER_COMMAND_TYPES = {
  play: 'string',
  setSpeed: 'number',
  setAvatar: 'string',
  pause: 'undefined',
  resume: 'undefined',
  stop: 'undefined',
} as const satisfies Record<PlayerMethod, TypeName>

// Legenda espelhada nas janelas de saída.
export type CaptionLineState = 'pending' | 'signing' | 'done' | 'skipped'

export type CaptionEvent =
  | { kind: 'final'; seg: string; text: string }
  | { kind: 'partial'; seg: string; text: string }
  | { kind: 'state'; seg: string; state: CaptionLineState }
  | { kind: 'clear' }

export const CAPTION_LINE_STATES = ['pending', 'signing', 'done', 'skipped'] as const satisfies readonly CaptionLineState[]

// Argumento opcional só para comandos sem payload.
export type ArgsOf<T> = T extends undefined ? [] : [T]
