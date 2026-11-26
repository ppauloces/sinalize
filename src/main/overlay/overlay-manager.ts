// Modo Overlay: ciclo de vida das janelas flutuantes (avatar e legendas), modo edição/apresentação,
// monitores, atalhos globais, persistência e roteamento do motor de sinalização Studio ↔ overlay.
// A sessão (microfone, transcrição e fila) continua sempre na janela do Studio; aqui só circulam saídas.
import path from 'node:path'
import { app, BrowserWindow, globalShortcut, ipcMain, screen, type IpcMainEvent, type IpcMainInvokeEvent, type Rectangle } from 'electron'
import { IPC } from '../../shared/api'
import {
  CAPTION_LINE_STATES,
  DEFAULT_ANCHOR,
  AVATAR_RATIO,
  OVERLAY_COMMAND_TYPES,
  OVERLAY_KINDS,
  PLAYER_COMMAND_TYPES,
  SHORTCUT_ACTIONS,
  type CaptionEvent,
  type CaptionLineState,
  type Engine,
  type OverlayCommand,
  type OverlayKind,
  type OverlayPatch,
  type OverlaySettings,
  type OverlayState,
  type PlayerState,
  type ResolvedBounds,
  type ShortcutAction,
} from '../../shared/overlay'
import { PRELOAD, pageUrl } from '../pages'
import { MARGIN, displayForRect, resolveBounds } from './display'
import * as S from './overlay-settings'

function captionEvent(ev: unknown): CaptionEvent | null {
  if (!ev || typeof ev !== 'object') return null
  const e = ev as Record<string, unknown>
  const seg = String(e.seg ?? '').slice(0, 64)
  const text = String(e.text ?? '').slice(0, 2000)
  switch (e.kind) {
    case 'final':
    case 'partial':
      return { kind: e.kind, seg, text }
    case 'state':
      return CAPTION_LINE_STATES.includes(e.state as CaptionLineState) ? { kind: 'state', seg, state: e.state as CaptionLineState } : null
    case 'clear':
      return { kind: 'clear' }
    default:
      return null
  }
}

export class OverlayManager {
  private readonly file = path.join(app.getPath('userData'), 'overlay.json')
  private settings: OverlaySettings = S.load(this.file)
  private active = false
  private editing = true
  private readonly windows: Record<OverlayKind, BrowserWindow | null> = { avatar: null, caption: null }
  private readonly applied: Record<OverlayKind, Rectangle | null> = { avatar: null, caption: null }
  private crashes: Record<OverlayKind, number> = { avatar: 0, caption: 0 }
  private shortcutFailures: ShortcutAction[] = []
  private saveTimer: NodeJS.Timeout | undefined

  constructor(private readonly getStudio: () => BrowserWindow | null) {}

  init() {
    this.registerIpc()
    this.registerShortcuts()
    const relayout = () => {
      this.sync()
      this.broadcast()
    }
    // Restaura a posição quando o monitor é desconectado ou muda de resolução/escala.
    screen.on('display-added', relayout)
    screen.on('display-removed', relayout)
    screen.on('display-metrics-changed', relayout)
    app.on('will-quit', () => {
      globalShortcut.unregisterAll()
      this.flush()
    })
  }

  private get engine(): Engine {
    return this.active && this.settings.avatar.visible ? 'overlay' : 'studio'
  }

  state(): OverlayState {
    const primaryId = screen.getPrimaryDisplay().id
    return {
      settings: this.settings,
      active: this.active,
      editing: this.editing,
      engine: this.engine,
      displays: screen.getAllDisplays().map((d, i) => ({
        id: d.id,
        label: d.label || `Monitor ${i + 1}`,
        bounds: d.bounds,
        workArea: d.workArea,
        scaleFactor: d.scaleFactor,
        primary: d.id === primaryId,
      })),
      bounds: { avatar: this.bounds('avatar'), caption: this.bounds('caption') },
      presets: [
        ...Object.entries(S.BUILTIN_PRESETS).map(([id, p]) => ({ id, label: p.label, builtin: true })),
        ...Object.keys(this.settings.customPresets).map((id) => ({ id, label: id, builtin: false })),
      ],
      shortcutFailures: this.shortcutFailures,
    }
  }

  private broadcast() {
    const state = this.state()
    for (const wc of [this.getStudio()?.webContents, ...OVERLAY_KINDS.map((k) => this.windows[k]?.webContents)]) {
      if (wc && !wc.isDestroyed()) wc.send(IPC.overlayState, state)
    }
  }

  private sendStudio(channel: string, ...args: unknown[]) {
    const wc = this.getStudio()?.webContents
    if (wc && !wc.isDestroyed()) wc.send(channel, ...args)
  }

  private update(patch: OverlayPatch | OverlaySettings) {
    const before = this.settings
    this.settings = S.sanitize(patch, before)
    if (JSON.stringify(before.shortcuts) !== JSON.stringify(this.settings.shortcuts)) this.registerShortcuts()
    this.persist()
    this.sync()
    this.broadcast()
  }

  private persist() {
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flush(), 300)
  }

  private flush() {
    clearTimeout(this.saveTimer)
    try {
      S.save(this.file, this.settings)
    } catch (e) {
      console.error('Overlay: falha ao salvar configurações', e)
    }
  }

  // Cria/destrói janelas conforme o estado e reaplica posição, topo e modo de interação.
  private sync() {
    for (const kind of OVERLAY_KINDS) {
      const wanted = this.active && this.settings[kind].visible
      const win = this.windows[kind]
      if (wanted && !win) this.createWindow(kind)
      else if (!wanted && win) win.destroy()
      else if (win) this.applyWindow(kind)
    }
  }

  private createWindow(kind: OverlayKind) {
    const win = new BrowserWindow({
      title: kind === 'avatar' ? 'Sinalize — Avatar' : 'Sinalize — Legendas',
      show: false,
      transparent: true,
      backgroundColor: '#00000000',
      frame: false,
      resizable: false,
      movable: true,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      // Evita que o overlay roube o foco da apresentação (WS_EX_NOACTIVATE no Windows).
      focusable: false,
      fullscreenable: false,
      minimizable: false,
      maximizable: false,
      webPreferences: {
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    })
    this.windows[kind] = win
    this.applied[kind] = null
    const page = kind === 'avatar' ? `avatar-overlay.html?avatar=${this.settings.avatar.character}` : 'caption-overlay.html'
    void win.loadURL(pageUrl(page))
    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return
      this.applyWindow(kind)
      win.showInactive()
      this.broadcast()
    })
    win.on('moved', () => this.onMoved(kind))
    win.webContents.on('render-process-gone', (_e, details) => {
      console.error(`Overlay ${kind}: renderer encerrado (${details.reason}), recriando`)
      if (!win.isDestroyed()) win.destroy()
      if (++this.crashes[kind] <= 3) setTimeout(() => this.sync(), 1000 * this.crashes[kind])
    })
    win.on('closed', () => {
      if (this.windows[kind] !== win) return
      this.windows[kind] = null
      if (kind === 'avatar') this.sendStudio(IPC.playerStatus, { status: null, speed: null } satisfies PlayerState)
      this.broadcast()
    })
  }

  private applyWindow(kind: OverlayKind) {
    const win = this.windows[kind]
    if (!win || win.isDestroyed()) return
    const { displayId: _displayId, ...b } = this.bounds(kind)
    this.applied[kind] = b
    win.setBounds(b)
    // Cruzar monitores com escalas DPI diferentes pode reescalar a janela no Windows; reaplica o tamanho.
    const now = win.getBounds()
    if (now.width !== b.width || now.height !== b.height) win.setBounds(b)
    win.setAlwaysOnTop(kind === 'caption' || this.settings.avatar.alwaysOnTop, 'screen-saver')
    // Mantém os cliques disponíveis para a janela abaixo.
    win.setIgnoreMouseEvents(!this.editing && this.settings.behavior.clickThrough)
  }

  private bounds(kind: OverlayKind): ResolvedBounds {
    const { avatar, caption } = this.settings
    const sizeFor = kind === 'avatar'
      ? (area: Rectangle) => S.avatarSize({ width: Math.min(avatar.width, area.width - 2 * MARGIN, (area.height - 2 * MARGIN) / AVATAR_RATIO) })
      : (area: Rectangle) => S.captionSize(caption, area.width - 2 * MARGIN)
    return resolveBounds(this.settings[kind], sizeFor, screen.getAllDisplays(), screen.getPrimaryDisplay(), {
      useFullBounds: this.settings.behavior.useFullBounds,
      fallbackAnchor: DEFAULT_ANCHOR[kind],
    })
  }

  // Arrasto nativo (app-region) terminou: grava a posição livre e o monitor de destino.
  private onMoved(kind: OverlayKind) {
    const b = this.windows[kind]?.getBounds()
    const last = this.applied[kind]
    if (!b || (last && last.x === b.x && last.y === b.y)) return
    const display = displayForRect(b, screen.getAllDisplays()) ?? screen.getPrimaryDisplay()
    this.update({ [kind]: { anchor: 'custom', x: b.x, y: b.y, displayId: display.id } })
  }

  close() {
    if (!this.active) return
    this.active = false
    this.sync()
    this.flush()
    this.broadcast()
  }

  private open() {
    if (this.active) return
    if (!this.settings.behavior.restoreLast) this.settings = S.resetLayout(this.settings)
    this.active = true
    this.editing = true
    this.crashes = { avatar: 0, caption: 0 }
    this.sync()
    this.broadcast()
  }

  private setEditing(on: boolean) {
    this.editing = on
    this.sync()
    this.broadcast()
  }

  private nextDisplay(kind: OverlayKind) {
    const displays = screen.getAllDisplays().sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    const current = this.bounds(kind).displayId
    const next = displays[(displays.findIndex((d) => d.id === current) + 1) % displays.length]
    if (!next) return
    const anchor = this.settings[kind].anchor === 'custom' ? DEFAULT_ANCHOR[kind] : this.settings[kind].anchor
    this.update({ [kind]: { displayId: next.id, anchor, x: null, y: null } })
  }

  private sendPlayer(method: string, arg?: unknown) {
    const wc = this.windows.avatar?.webContents
    if (wc && !wc.isDestroyed()) wc.send(IPC.playerCmd, method, arg)
  }

  // `arg` já teve o tipo validado contra OVERLAY_COMMAND_TYPES.
  private command(cmd: OverlayCommand, arg: unknown) {
    const s = this.settings
    switch (cmd) {
      case 'open': return this.open()
      case 'close': return this.close()
      case 'toggle': return this.active ? this.close() : this.open()
      case 'edit': return this.setEditing(arg as boolean)
      case 'toggleEdit':
        if (!this.active) return this.open()
        return this.setEditing(!this.editing)
      case 'reset': return this.update(S.resetLayout(s))
      case 'toggleAvatar': return this.update({ avatar: { visible: !s.avatar.visible } })
      case 'toggleCaption': return this.update({ caption: { visible: !s.caption.visible } })
      case 'applyPreset': return this.update(S.applyPreset(s, arg as string))
      case 'savePreset': return this.update(S.savePreset(s, (arg as string).trim().slice(0, 40)))
      case 'deletePreset': return this.update(S.deletePreset(s, arg as string))
      case 'nextDisplay':
        if (OVERLAY_KINDS.includes(arg as OverlayKind)) this.nextDisplay(arg as OverlayKind)
        return
      case 'resizeAvatar': {
        // Mantém o canto superior esquerdo fixo: a alça fica sob o cursor durante o arrasto.
        const b = this.windows.avatar?.getBounds()
        return this.update({ avatar: { width: arg as number, ...(b && { anchor: 'custom' as const, x: b.x, y: b.y }) } })
      }
      case 'resizeCaption': {
        const width = arg as number
        if (s.caption.anchor !== 'custom') return this.update({ caption: { maxWidth: width } })
        const b = this.windows.caption?.getBounds()
        return this.update({ caption: { maxWidth: width, ...(b && { x: b.x + Math.round((b.width - width) / 2) }) } })
      }
      case 'focusStudio': {
        const studio = this.getStudio()
        if (!studio) return
        if (studio.isMinimized()) studio.restore()
        studio.show()
        studio.focus()
        return this.sendStudio(IPC.overlayFocus, arg)
      }
    }
  }

  private registerShortcuts() {
    globalShortcut.unregisterAll()
    const handlers: Record<ShortcutAction, () => void> = {
      toggleOverlay: () => this.command('toggle', undefined),
      toggleEdit: () => this.command('toggleEdit', undefined),
      toggleAvatar: () => this.command('toggleAvatar', undefined),
      toggleCaption: () => this.command('toggleCaption', undefined),
      resetLayout: () => this.command('reset', undefined),
      toggleMic: () => this.sendStudio(IPC.overlayShortcut, 'toggleMic'),
    }
    this.shortcutFailures = []
    const seen = new Set<string>()
    for (const action of SHORTCUT_ACTIONS) {
      const accel = this.settings.shortcuts[action]
      if (!accel) continue
      let ok = false
      try {
        // false: já registrado por outro app (ou repetido nesta lista); exceção: acelerador inválido.
        ok = !seen.has(accel.toLowerCase()) && globalShortcut.register(accel, handlers[action])
      } catch {
        ok = false
      }
      seen.add(accel.toLowerCase())
      if (!ok) this.shortcutFailures.push(action)
    }
  }

  private registerIpc() {
    const isStudio = (e: IpcMainEvent | IpcMainInvokeEvent) => e.sender === this.getStudio()?.webContents
    const isOverlay = (e: IpcMainEvent | IpcMainInvokeEvent) => OVERLAY_KINDS.some((k) => this.windows[k]?.webContents === e.sender)

    ipcMain.handle(IPC.overlayGet, () => this.state())

    ipcMain.handle(IPC.overlayUpdate, (e, patch: unknown) => {
      if (!isStudio(e)) throw new Error('overlay:update só é aceito do Studio')
      if (!patch || typeof patch !== 'object') throw new Error('patch inválido')
      this.update(patch as OverlayPatch)
      return this.state()
    })

    ipcMain.handle(IPC.overlayCommand, (e, cmd: unknown, arg: unknown) => {
      if (!isStudio(e) && !isOverlay(e)) throw new Error('remetente desconhecido')
      if (typeof cmd !== 'string' || !Object.hasOwn(OVERLAY_COMMAND_TYPES, cmd)) throw new Error(`comando inválido: ${String(cmd)}`)
      const command = cmd as OverlayCommand
      if (typeof arg !== OVERLAY_COMMAND_TYPES[command]) throw new Error(`argumento inválido para ${command}`)
      this.command(command, arg)
      return this.state()
    })

    // Preserva a sessão ao alternar a saída do avatar: a fila no Studio comanda o Unity do overlay.
    ipcMain.on(IPC.playerCmd, (e, method: unknown, arg: unknown) => {
      if (!isStudio(e) || typeof method !== 'string' || !Object.hasOwn(PLAYER_COMMAND_TYPES, method)) return
      if (typeof arg === PLAYER_COMMAND_TYPES[method as keyof typeof PLAYER_COMMAND_TYPES]) this.sendPlayer(method, arg)
    })

    ipcMain.on(IPC.playerStatus, (e, s: Partial<PlayerState> | undefined) => {
      if (e.sender !== this.windows.avatar?.webContents) return
      const status = s?.status === 'idle' || s?.status === 'playing' || s?.status === 'paused' ? s.status : null
      const speed = typeof s?.speed === 'number' && Number.isFinite(s.speed) ? s.speed : null
      this.sendStudio(IPC.playerStatus, { status, speed } satisfies PlayerState)
    })

    ipcMain.on(IPC.captionEvent, (e, ev: unknown) => {
      const clean = isStudio(e) ? captionEvent(ev) : null
      const wc = this.windows.caption?.webContents
      if (clean && wc && !wc.isDestroyed()) wc.send(IPC.captionEvent, clean)
    })
  }
}
