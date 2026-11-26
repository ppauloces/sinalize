// Contratos do Modo Overlay compartilhados entre main, preload e renderer.

export const ANCHORS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center', 'bottom-center', 'custom'] as const
export const AVATARS = ['icaro', 'hosana', 'guga'] as const
export const FONTS = ['Inter', 'Geist', 'Segoe UI', 'Arial', 'Verdana'] as const
export const CAPTION_SOURCES = ['live', 'final', 'signing'] as const
export const SHORTCUT_ACTIONS = ['toggleOverlay', 'toggleEdit', 'toggleAvatar', 'toggleCaption', 'resetLayout', 'toggleMic'] as const
export const OVERLAY_KINDS = ['avatar', 'caption'] as const

export type Anchor = (typeof ANCHORS)[number]
export type AvatarName = (typeof AVATARS)[number]
export type FontFamily = (typeof FONTS)[number]
export type CaptionSource = (typeof CAPTION_SOURCES)[number]
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number]
export type OverlayKind = (typeof OVERLAY_KINDS)[number]

// Proporção do palco do avatar (altura / largura): redimensiona sem distorcer o personagem.
export const AVATAR_RATIO = 420 / 320
export const DEFAULT_ANCHOR: Record<OverlayKind, Anchor> = { avatar: 'bottom-right', caption: 'bottom-center' }

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

export type Shortcuts = Record<ShortcutAction, string>

export interface PresetSnapshot {
  avatar: AvatarSettings
  caption: CaptionSettings
}

export interface OverlaySettings {
  avatar: AvatarSettings
  caption: CaptionSettings
  behavior: BehaviorSettings
  shortcuts: Shortcuts
  customPresets: Record<string, PresetSnapshot>
}

export interface OverlayPatch {
  avatar?: Partial<AvatarSettings>
  caption?: Partial<CaptionSettings>
  behavior?: Partial<BehaviorSettings>
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

export type Engine = 'studio' | 'overlay'

export interface OverlayState {
  settings: OverlaySettings
  active: boolean
  editing: boolean
  engine: Engine
  displays: DisplayInfo[]
  bounds: Record<OverlayKind, ResolvedBounds>
  presets: PresetInfo[]
  shortcutFailures: ShortcutAction[]
}

// overlay:command — comando → tipo do argumento (validado em runtime no main).
export interface OverlayCommandArgs {
  open: undefined
  close: undefined
  toggle: undefined
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
}
export type OverlayCommand = keyof OverlayCommandArgs

type TypeName = 'undefined' | 'boolean' | 'string' | 'number'
export const OVERLAY_COMMAND_TYPES = {
  open: 'undefined',
  close: 'undefined',
  toggle: 'undefined',
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
} as const satisfies Record<OverlayCommand, TypeName>

// Motor de sinalização: o Studio comanda o Unity que estiver no overlay.
export type PlayerStatus = 'idle' | 'playing' | 'paused'

export interface PlayerState {
  status: PlayerStatus | null
  speed: number | null
}

export interface PlayerCommandArgs {
  play: string
  setSpeed: number
  setAvatar: string
  stop: undefined
}
export type PlayerMethod = keyof PlayerCommandArgs

export const PLAYER_COMMAND_TYPES = {
  play: 'string',
  setSpeed: 'number',
  setAvatar: 'string',
  stop: 'undefined',
} as const satisfies Record<PlayerMethod, TypeName>

// Legenda espelhada na janela flutuante.
export type CaptionLineState = 'pending' | 'signing' | 'done' | 'skipped'

export type CaptionEvent =
  | { kind: 'final'; seg: string; text: string }
  | { kind: 'partial'; seg: string; text: string }
  | { kind: 'state'; seg: string; state: CaptionLineState }
  | { kind: 'clear' }

export const CAPTION_LINE_STATES: readonly CaptionLineState[] = ['pending', 'signing', 'done', 'skipped']

// Argumento opcional só para comandos sem payload.
export type ArgsOf<T> = T extends undefined ? [] : [T]
