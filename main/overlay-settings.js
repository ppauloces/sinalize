// Configurações do Modo Overlay: padrões, presets e validação (fronteira de confiança do IPC).
const fs = require('fs')

// Proporção do palco do avatar (altura / largura): redimensiona sem distorcer o personagem.
const AVATAR_RATIO = 420 / 320

const ANCHORS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center', 'bottom-center', 'custom']
const AVATARS = ['icaro', 'hosana', 'guga']
const FONTS = ['Inter', 'Geist', 'Segoe UI', 'Arial', 'Verdana']
const CAPTION_SOURCES = ['live', 'final', 'signing']
const SHORTCUT_ACTIONS = ['toggleOverlay', 'toggleEdit', 'toggleAvatar', 'toggleCaption', 'resetLayout', 'toggleMic']

const DEFAULTS = {
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

const RANGES = {
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

const ENUMS = {
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
function isAccelerator(value) {
  const parts = value.split('+')
  const key = parts.pop()
  const mods = parts.map((m) => m.toLowerCase())
  return KEY.test(key) && mods.every((m) => MODIFIERS.includes(m)) && new Set(mods).size === mods.length && mods.some((m) => m !== 'shift')
}

const BUILTIN_PRESETS = {
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

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

// Mescla `input` sobre `base` validando tipo, faixa e enum de cada campo; o que for inválido mantém `base`.
// Com base = DEFAULTS carrega do disco; com base = configuração atual aplica um patch vindo do renderer.
function sanitize(input, base = DEFAULTS, prefix = '') {
  const out = {}
  for (const [key, fallback] of Object.entries(base)) {
    const path = prefix + key
    const value = input?.[key]
    if (path === 'customPresets') out[key] = sanitizePresets(value === undefined ? fallback : value)
    else if (fallback && typeof fallback === 'object') out[key] = sanitize(value, fallback, path + '.')
    else if (NULLABLE.has(key)) out[key] = value === null || Number.isFinite(value) ? value : fallback
    else if (typeof value !== typeof fallback) out[key] = fallback
    else if (ENUMS[path]) out[key] = ENUMS[path].includes(value) ? value : fallback
    else if (RANGES[path]) out[key] = Number.isFinite(value) ? clamp(value, ...RANGES[path]) : fallback
    else if (prefix === 'shortcuts.') out[key] = value === '' || isAccelerator(value) ? value : fallback
    else if (typeof fallback === 'string' && fallback.startsWith('#')) out[key] = COLOR.test(value) ? value.toLowerCase() : fallback
    else out[key] = value
  }
  return out
}

function sanitizePresets(input) {
  if (!input || typeof input !== 'object') return {}
  const out = {}
  for (const [name, preset] of Object.entries(input).slice(0, 30)) {
    const label = String(name).trim().slice(0, 40)
    if (!label || BUILTIN_PRESETS[label]) continue
    out[label] = { avatar: sanitize(preset?.avatar, DEFAULTS.avatar, 'avatar.'), caption: sanitize(preset?.caption, DEFAULTS.caption, 'caption.') }
  }
  return out
}

// Aplica um preset: posições voltam a ser ancoradas (x/y livres são descartados).
function applyPreset(settings, name) {
  const preset = BUILTIN_PRESETS[name] || settings.customPresets[name]
  if (!preset) return settings
  const reset = { x: null, y: null }
  return sanitize({ avatar: { ...preset.avatar, ...(BUILTIN_PRESETS[name] ? reset : {}) }, caption: { ...preset.caption, ...(BUILTIN_PRESETS[name] ? reset : {}) } }, settings)
}

function savePreset(settings, name) {
  return sanitize({ customPresets: { ...settings.customPresets, [name]: { avatar: settings.avatar, caption: settings.caption } } }, settings)
}

function deletePreset(settings, name) {
  const customPresets = { ...settings.customPresets }
  delete customPresets[name]
  return { ...settings, customPresets }
}

// Volta avatar e legenda aos pontos de ancoragem padrão, preservando estilo e tamanho.
function resetLayout(settings) {
  const pick = ({ displayId, anchor, x, y }) => ({ displayId, anchor, x, y })
  return sanitize({ avatar: pick(DEFAULTS.avatar), caption: pick(DEFAULTS.caption) }, settings)
}

const avatarSize = (a) => ({ width: Math.round(a.width), height: Math.round(a.width * AVATAR_RATIO) })

// Altura da janela de legenda = linhas visíveis + padding do fundo + folga da sombra.
function captionSize(c, maxWidth = Infinity) {
  const pad = Math.round(c.fontSize * 0.35)
  return {
    width: Math.round(Math.min(c.maxWidth, maxWidth)),
    height: Math.ceil(c.fontSize * c.lineHeight * c.maxLines + pad * 2 + 16),
  }
}

function load(file) {
  try {
    return sanitize(JSON.parse(fs.readFileSync(file, 'utf8')))
  } catch {
    return sanitize({})
  }
}

// Escrita atômica: um crash no meio não corrompe as posições salvas.
function save(file, settings) {
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

module.exports = {
  ANCHORS, AVATARS, FONTS, CAPTION_SOURCES, SHORTCUT_ACTIONS, DEFAULTS, BUILTIN_PRESETS, AVATAR_RATIO,
  sanitize, isAccelerator, applyPreset, savePreset, deletePreset, resetLayout, avatarSize, captionSize, load, save,
}
