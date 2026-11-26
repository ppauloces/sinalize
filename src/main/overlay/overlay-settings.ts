// Configurações do Modo Overlay: padrões, presets e validação (fronteira de confiança do IPC).
import fs from 'node:fs'
import {
  ANCHORS,
  AVATARS,
  AVATAR_RATIO,
  CAPTION_SOURCES,
  FONTS,
  type AvatarSettings,
  type CaptionSettings,
  type OverlayPatch,
  type OverlaySettings,
  type PresetSnapshot,
} from '../../shared/overlay'

export const DEFAULTS: OverlaySettings = {
  avatar: {
    visible: true,
    character: 'icaro',
    width: 280,
    speed: 2,
    alwaysOnTop: true,
    displayId: null,
    anchor: 'bottom-right',
    x: null,
    y: null,
  },
  caption: {
    visible: true,
    source: 'live',
    fontFamily: 'Inter',
    fontSize: 32,
    fontWeight: 600,
    color: '#ffffff',
    bgColor: '#000000',
    bgOpacity: 0.6,
    outline: false,
    shadow: true,
    maxWidth: 1100,
    lineHeight: 1.3,
    maxLines: 2,
    holdMs: 4000,
    displayId: null,
    anchor: 'bottom-center',
    x: null,
    y: null,
  },
  behavior: {
    clickThrough: true,
    restoreLast: true,
    autoStart: false,
    useFullBounds: false,
  },
  // Ctrl+Shift+<letra> colide com Teams (M=mudo, O=câmera, E=compartilhar) e Chrome/Edge (O, A, R, M);
  // atalhos globais têm precedência sobre esses apps, então o padrão usa Ctrl+Alt+Shift.
  shortcuts: {
    toggleOverlay: 'Ctrl+Alt+Shift+O',
    toggleEdit: 'Ctrl+Alt+Shift+E',
    toggleAvatar: 'Ctrl+Alt+Shift+A',
    toggleCaption: 'Ctrl+Alt+Shift+L',
    resetLayout: 'Ctrl+Alt+Shift+R',
    toggleMic: 'Ctrl+Alt+Shift+M',
  },
  customPresets: {},
}

const RANGES: Record<string, [number, number]> = {
  'avatar.width': [140, 900],
  'avatar.speed': [0.5, 2.5],
  'caption.fontSize': [14, 96],
  'caption.fontWeight': [300, 900],
  'caption.bgOpacity': [0, 1],
  'caption.maxWidth': [300, 3840],
  'caption.lineHeight': [1, 2],
  'caption.maxLines': [1, 6],
  'caption.holdMs': [0, 30000],
}

const ENUMS: Record<string, readonly string[]> = {
  'avatar.character': AVATARS,
  'avatar.anchor': ANCHORS,
  'caption.anchor': ANCHORS,
  'caption.source': CAPTION_SOURCES,
  'caption.fontFamily': FONTS,
}

const NULLABLE = new Set(['displayId', 'x', 'y'])
const COLOR = /^#[0-9a-f]{6}$/i
const MODIFIERS = ['ctrl', 'control', 'commandorcontrol', 'cmdorctrl', 'command', 'cmd', 'alt', 'option', 'altgr', 'shift', 'super', 'meta']
const KEY = /^([a-z0-9]|f([1-9]|1\d|2[0-4])|space|tab|backspace|delete|insert|enter|return|up|down|left|right|home|end|pageup|pagedown|escape|esc|plus)$/i

// O Electron registrou "Ctrl+Nada+X" sem reportar erro, e um atalho global sem modificador real
// sequestraria a digitação em todo o sistema: valida antes de registrar.
export function isAccelerator(value: string) {
  const parts = value.split('+')
  const key = parts.pop() ?? ''
  const mods = parts.map((m) => m.toLowerCase())
  return KEY.test(key) && mods.every((m) => MODIFIERS.includes(m)) && new Set(mods).size === mods.length && mods.some((m) => m !== 'shift')
}

interface BuiltinPreset {
  label: string
  avatar: Partial<AvatarSettings>
  caption: Partial<CaptionSettings>
}

export const BUILTIN_PRESETS: Record<string, BuiltinPreset> = {
  palestra: {
    label: 'Palestra',
    avatar: { visible: true, width: 280, anchor: 'bottom-right' },
    caption: { visible: true, anchor: 'bottom-center', fontSize: 32, fontWeight: 600, color: '#ffffff', bgColor: '#000000', bgOpacity: 0.6, maxLines: 2 },
  },
  'sala-de-aula': {
    label: 'Sala de aula',
    avatar: { visible: true, width: 400, anchor: 'bottom-right' },
    caption: { visible: true, anchor: 'bottom-center', fontSize: 44, fontWeight: 700, color: '#ffff00', bgColor: '#000000', bgOpacity: 0.92, outline: false, maxLines: 2 },
  },
  reuniao: {
    label: 'Reunião online',
    avatar: { visible: true, width: 190, anchor: 'bottom-right' },
    caption: { visible: true, anchor: 'bottom-center', fontSize: 26, fontWeight: 600, bgOpacity: 0.7, maxLines: 2, maxWidth: 900 },
  },
  'somente-legendas': {
    label: 'Somente legendas',
    avatar: { visible: false },
    caption: { visible: true, anchor: 'bottom-center', fontSize: 34, maxLines: 3 },
  },
}

const isBuiltin = (name: string) => Object.hasOwn(BUILTIN_PRESETS, name)
const clamp = (v: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, v))
type Bag = Record<string, unknown>
const isBag = (v: unknown): v is Bag => !!v && typeof v === 'object' && !Array.isArray(v)

// Mescla `input` sobre `base` validando tipo, faixa e enum de cada campo; o que for inválido mantém `base`.
// Só as chaves de `base` são lidas, então chaves extras (inclusive __proto__) são ignoradas.
function merge(input: unknown, base: Bag, prefix: string): Bag {
  const src = isBag(input) ? input : {}
  const out: Bag = {}
  for (const [key, fallback] of Object.entries(base)) {
    const path = prefix + key
    const value = src[key]
    const range = RANGES[path]
    const options = ENUMS[path]
    if (path === 'customPresets') out[key] = sanitizePresets(value === undefined ? fallback : value)
    else if (isBag(fallback)) out[key] = merge(value, fallback, path + '.')
    else if (NULLABLE.has(key)) out[key] = value === null || Number.isFinite(value) ? value : fallback
    else if (typeof value !== typeof fallback) out[key] = fallback
    else if (options) out[key] = options.includes(value as string) ? value : fallback
    else if (range) out[key] = Number.isFinite(value) ? clamp(value as number, range) : fallback
    else if (prefix === 'shortcuts.') out[key] = value === '' || isAccelerator(value as string) ? value : fallback
    else if (typeof fallback === 'string' && fallback.startsWith('#')) out[key] = COLOR.test(value as string) ? (value as string).toLowerCase() : fallback
    else out[key] = value
  }
  return out
}

// Com base = DEFAULTS carrega do disco; com base = configuração atual aplica um patch vindo do renderer.
export function sanitize(input: unknown, base: OverlaySettings = DEFAULTS): OverlaySettings {
  return merge(input, base as unknown as Bag, '') as unknown as OverlaySettings
}

function sanitizePresets(input: unknown): Record<string, PresetSnapshot> {
  if (!isBag(input)) return {}
  const out: Record<string, PresetSnapshot> = {}
  for (const [name, preset] of Object.entries(input).slice(0, 30)) {
    const label = name.trim().slice(0, 40)
    if (!label || isBuiltin(label)) continue
    const p = isBag(preset) ? preset : {}
    out[label] = {
      avatar: merge(p.avatar, DEFAULTS.avatar as unknown as Bag, 'avatar.') as unknown as AvatarSettings,
      caption: merge(p.caption, DEFAULTS.caption as unknown as Bag, 'caption.') as unknown as CaptionSettings,
    }
  }
  return out
}

// Aplica um preset: posições dos embutidos voltam a ser ancoradas (x/y livres são descartados).
export function applyPreset(settings: OverlaySettings, name: string): OverlaySettings {
  const builtin = isBuiltin(name) ? BUILTIN_PRESETS[name] : undefined
  const preset = builtin ?? (Object.hasOwn(settings.customPresets, name) ? settings.customPresets[name] : undefined)
  if (!preset) return settings
  const reset = builtin ? { x: null, y: null } : {}
  const patch: OverlayPatch = { avatar: { ...preset.avatar, ...reset }, caption: { ...preset.caption, ...reset } }
  return sanitize(patch, settings)
}

export function savePreset(settings: OverlaySettings, name: string): OverlaySettings {
  return sanitize({ customPresets: { ...settings.customPresets, [name]: { avatar: settings.avatar, caption: settings.caption } } }, settings)
}

export function deletePreset(settings: OverlaySettings, name: string): OverlaySettings {
  const customPresets = { ...settings.customPresets }
  delete customPresets[name]
  return { ...settings, customPresets }
}

// Volta avatar e legenda aos pontos de ancoragem padrão, preservando estilo e tamanho.
export function resetLayout(settings: OverlaySettings): OverlaySettings {
  const pick = ({ displayId, anchor, x, y }: AvatarSettings | CaptionSettings) => ({ displayId, anchor, x, y })
  return sanitize({ avatar: pick(DEFAULTS.avatar), caption: pick(DEFAULTS.caption) }, settings)
}

export const avatarSize = (a: { width: number }) => ({ width: Math.round(a.width), height: Math.round(a.width * AVATAR_RATIO) })

// Altura da janela de legenda = linhas visíveis + padding do fundo + folga da sombra.
export function captionSize(c: CaptionSettings, maxWidth = Infinity) {
  const pad = Math.round(c.fontSize * 0.35)
  return {
    width: Math.round(Math.min(c.maxWidth, maxWidth)),
    height: Math.ceil(c.fontSize * c.lineHeight * c.maxLines + pad * 2 + 16),
  }
}

export function load(file: string): OverlaySettings {
  try {
    return sanitize(JSON.parse(fs.readFileSync(file, 'utf8')))
  } catch {
    return sanitize({})
  }
}

// Escrita atômica: um crash no meio não corrompe as posições salvas.
export function save(file: string, settings: OverlaySettings) {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}
