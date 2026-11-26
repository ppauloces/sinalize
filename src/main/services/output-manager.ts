// Saídas de apresentação: Telão (janela de projeção) e Overlay (avatar e legendas flutuantes).
// Coordena a única instância do Unity entre Studio, Telão e Overlay, monitores, atalhos globais,
// persistência e recuperação de falhas. Captura, transcrição e fila continuam sempre no Studio.
import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, globalShortcut, ipcMain, screen, type IpcMainEvent, type IpcMainInvokeEvent, type Rectangle } from 'electron'
import { IPC } from '../../shared/ipc'
import {
  AVATAR_RATIO,
  DEFAULT_ANCHOR,
  ENGINES,
  OUTPUT_COMMAND_TYPES,
  OVERLAY_KINDS,
  PLAYER_COMMAND_TYPES,
  SHORTCUT_ACTIONS,
  type Engine,
  type OutputCommand,
  type OutputPatch,
  type OutputSettings,
  type OutputState,
  type OverlayKind,
  type PlayerState,
  type ResolvedBounds,
  type ShortcutAction,
} from '../../shared/output'
import { captionEventSchema, playerStateSchema } from '../../shared/schemas'
import { PRELOAD, pageUrl } from '../pages'
import { createPresentationWindow } from '../windows/presentation.window'
import { MARGIN, displayForRect, resolveBounds } from './display'
import * as S from './output-settings'

type WindowKey = OverlayKind | 'presentation'
const WINDOW_KEYS: WindowKey[] = ['avatar', 'caption', 'presentation']

// Preserva as preferências do Modo Overlay salvas antes da v2 (overlay.json).
function loadSettings(file: string) {
  const legacy = path.join(path.dirname(file), 'overlay.json')
  return S.load(fs.existsSync(file) || !fs.existsSync(legacy) ? file : legacy)
}

export class OutputManager {
  private readonly file = path.join(app.getPath('userData'), 'output.json')
  private settings: OutputSettings = loadSettings(this.file)
  private overlayActive = false
  private editing = true
  private readonly windows: Record<WindowKey, BrowserWindow | null> = { avatar: null, caption: null, presentation: null }
  private readonly applied: Record<OverlayKind, Rectangle | null> = { avatar: null, caption: null }
  private crashes: Record<WindowKey, number> = { avatar: 0, caption: 0, presentation: 0 }
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

  private get presentationOpen() {
    return !!this.windows.presentation
  }

  // Prioridade do avatar: Telão > Overlay > Studio (uma única instância do Unity por vez).
  private get engine(): Engine {
    if (this.presentationOpen) return 'presentation'
    return this.overlayActive && this.settings.avatar.visible ? 'overlay' : 'studio'
  }

  private engineWindow() {
    const engine = this.engine
    return engine === 'presentation' ? this.windows.presentation : engine === 'overlay' ? this.windows.avatar : null
  }

  state(): OutputState {
    const primaryId = screen.getPrimaryDisplay().id
    return {
      settings: this.settings,
      overlayActive: this.overlayActive,
      editing: this.editing,
      presentationOpen: this.presentationOpen,
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
    for (const wc of [this.getStudio()?.webContents, ...WINDOW_KEYS.map((k) => this.windows[k]?.webContents)]) {
      if (wc && !wc.isDestroyed()) wc.send(IPC.outputState, state)
    }
  }

  private sendStudio(channel: string, ...args: unknown[]) {
    const wc = this.getStudio()?.webContents
    if (wc && !wc.isDestroyed()) wc.send(channel, ...args)
  }

  private update(patch: OutputPatch | OutputSettings) {
    const before = this.settings
    this.settings = S.sanitize(patch, before)
    if (JSON.stringify(before.shortcuts) !== JSON.stringify(this.settings.shortcuts)) this.registerShortcuts()
    if (JSON.stringify(before.presentation) !== JSON.stringify(this.settings.presentation)) this.reopenPresentation(before)
    this.persist()
    this.sync()
    this.broadcast()
  }

  // Monitor ou tela cheia do Telão mudou: reabre na nova posição (a fila espera o Unity recarregar).
  private reopenPresentation(before: OutputSettings) {
    const p = this.settings.presentation
    const moved = p.displayId !== before.presentation.displayId || p.fullscreen !== before.presentation.fullscreen
    if (!moved || !this.windows.presentation) return
    this.windows.presentation.destroy()
    this.openPresentation()
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
      console.error('Saídas: falha ao salvar configurações', e)
    }
  }

  // Cria/destrói as janelas do overlay conforme o estado e reaplica posição, topo e interação.
  private sync() {
    for (const kind of OVERLAY_KINDS) {
      const wanted = this.overlayActive && this.settings[kind].visible && !(kind === 'avatar' && this.presentationOpen)
      const win = this.windows[kind]
      if (wanted && !win) this.createOverlayWindow(kind)
      else if (!wanted && win) win.destroy()
      else if (win) this.applyOverlayWindow(kind)
    }
  }

  private watch(key: WindowKey, win: BrowserWindow, recreate: () => void) {
    win.webContents.on('render-process-gone', (_e, details) => {
      console.error(`Saída ${key}: renderer encerrado (${details.reason}), recriando`)
      if (!win.isDestroyed()) win.destroy()
      if (++this.crashes[key] <= 3) setTimeout(recreate, 1000 * this.crashes[key])
    })
    win.on('closed', () => {
      if (this.windows[key] !== win) return
      this.windows[key] = null
      // O motor mudou de janela: o Studio volta a ver o player como carregando.
      this.sendStudio(IPC.playerStatus, { status: null, speed: null } satisfies PlayerState)
      this.sync()
      this.broadcast()
    })
  }

  private createOverlayWindow(kind: OverlayKind) {
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
      webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    })
    this.windows[kind] = win
    this.applied[kind] = null
    const page = kind === 'avatar' ? `avatar-overlay.html?avatar=${this.settings.avatar.character}` : 'caption-overlay.html'
    void win.loadURL(pageUrl(page))
    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return
      this.applyOverlayWindow(kind)
      win.showInactive()
      this.broadcast()
    })
    win.on('moved', () => this.onMoved(kind))
    this.watch(kind, win, () => this.sync())
  }

  private openPresentation() {
    if (this.windows.presentation) return
    const win = createPresentationWindow(this.settings.presentation)
    this.windows.presentation = win
    this.watch('presentation', win, () => this.openPresentation())
    this.sync()
    this.broadcast()
  }

  private applyOverlayWindow(kind: OverlayKind) {
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

  closeAll() {
    this.overlayActive = false
    this.windows.presentation?.destroy()
    this.sync()
    this.flush()
  }

  private openOverlay() {
    if (this.overlayActive) return
    if (!this.settings.behavior.restoreLast) this.settings = S.resetLayout(this.settings)
    this.overlayActive = true
    this.editing = true
    this.crashes.avatar = this.crashes.caption = 0
    this.sync()
    this.broadcast()
  }

  private closeOverlay() {
    if (!this.overlayActive) return
    this.overlayActive = false
    this.sync()
    this.flush()
    this.broadcast()
  }

  private setEditing(on: boolean) {
    this.editing = on
    this.sync()
    this.broadcast()
  }

  // Seleção da saída do avatar pelo Studio.
  private setEngine(engine: Engine) {
    if (engine !== 'presentation') this.windows.presentation?.destroy()
    if (engine === 'presentation') return this.openPresentation()
    if (engine === 'overlay') {
      if (!this.settings.avatar.visible) this.update({ avatar: { visible: true } })
      return this.openOverlay()
    }
    if (this.overlayActive && this.settings.avatar.visible) this.update({ avatar: { visible: false } })
    else this.broadcast()
  }

  private nextDisplay(kind: OverlayKind) {
    const displays = screen.getAllDisplays().sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    const current = this.bounds(kind).displayId
    const next = displays[(displays.findIndex((d) => d.id === current) + 1) % displays.length]
    if (!next) return
    const anchor = this.settings[kind].anchor === 'custom' ? DEFAULT_ANCHOR[kind] : this.settings[kind].anchor
    this.update({ [kind]: { displayId: next.id, anchor, x: null, y: null } })
  }

  // `arg` já teve o tipo validado contra OUTPUT_COMMAND_TYPES.
  private command(cmd: OutputCommand, arg: unknown) {
    const s = this.settings
    switch (cmd) {
      case 'openOverlay': return this.openOverlay()
      case 'closeOverlay': return this.closeOverlay()
      case 'toggleOverlay': return this.overlayActive ? this.closeOverlay() : this.openOverlay()
      case 'edit': return this.setEditing(arg as boolean)
      case 'toggleEdit':
        if (!this.overlayActive) return this.openOverlay()
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
        return this.sendStudio(IPC.outputFocus, arg)
      }
      case 'togglePresentation':
        return this.presentationOpen ? this.windows.presentation?.destroy() : this.openPresentation()
      case 'setEngine':
        if (ENGINES.includes(arg as Engine)) this.setEngine(arg as Engine)
        return
    }
  }

  private registerShortcuts() {
    globalShortcut.unregisterAll()
    const handlers: Record<ShortcutAction, () => void> = {
      toggleOverlay: () => this.command('toggleOverlay', undefined),
      toggleEdit: () => this.command('toggleEdit', undefined),
      toggleAvatar: () => this.command('toggleAvatar', undefined),
      toggleCaption: () => this.command('toggleCaption', undefined),
      resetLayout: () => this.command('reset', undefined),
      toggleMic: () => this.sendStudio(IPC.outputShortcut, 'toggleMic'),
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
    const isOutput = (e: IpcMainEvent | IpcMainInvokeEvent) => WINDOW_KEYS.some((k) => this.windows[k]?.webContents === e.sender)

    ipcMain.handle(IPC.outputGet, () => this.state())

    ipcMain.handle(IPC.outputUpdate, (e, patch: unknown) => {
      if (!isStudio(e)) throw new Error('output:update só é aceito do Studio')
      if (!patch || typeof patch !== 'object') throw new Error('patch inválido')
      this.update(patch as OutputPatch)
      return this.state()
    })

    ipcMain.handle(IPC.outputCommand, (e, cmd: unknown, arg: unknown) => {
      if (!isStudio(e) && !isOutput(e)) throw new Error('remetente desconhecido')
      if (typeof cmd !== 'string' || !Object.hasOwn(OUTPUT_COMMAND_TYPES, cmd)) throw new Error(`comando inválido: ${String(cmd)}`)
      const command = cmd as OutputCommand
      if (typeof arg !== OUTPUT_COMMAND_TYPES[command]) throw new Error(`argumento inválido para ${command}`)
      this.command(command, arg)
      return this.state()
    })

    // Preserva a sessão ao alternar a saída: a fila no Studio comanda o Unity da saída ativa.
    ipcMain.on(IPC.playerCmd, (e, method: unknown, arg: unknown) => {
      if (!isStudio(e) || typeof method !== 'string' || !Object.hasOwn(PLAYER_COMMAND_TYPES, method)) return
      if (typeof arg !== PLAYER_COMMAND_TYPES[method as keyof typeof PLAYER_COMMAND_TYPES]) return
      const wc = this.engineWindow()?.webContents
      if (wc && !wc.isDestroyed()) wc.send(IPC.playerCmd, method, arg)
    })

    ipcMain.on(IPC.playerStatus, (e, s: unknown) => {
      if (e.sender !== this.engineWindow()?.webContents) return
      this.sendStudio(IPC.playerStatus, playerStateSchema.parse(s ?? {}))
    })

    ipcMain.on(IPC.captionEvent, (e, ev: unknown) => {
      const parsed = isStudio(e) ? captionEventSchema.safeParse(ev) : null
      if (!parsed?.success) return
      for (const key of ['caption', 'presentation'] as const) {
        const wc = this.windows[key]?.webContents
        if (wc && !wc.isDestroyed()) wc.send(IPC.captionEvent, parsed.data)
      }
    })
  }
}
