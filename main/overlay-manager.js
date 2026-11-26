// Modo Overlay: ciclo de vida das janelas flutuantes (avatar e legendas), modo edição/apresentação,
// monitores, atalhos globais, persistência e roteamento do motor de sinalização Studio ↔ overlay.
// A sessão (microfone, transcrição e fila) continua sempre na janela do Studio; aqui só circulam saídas.
const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron')
const path = require('path')
const S = require('./overlay-settings')
const { resolveBounds, displayForRect, MARGIN } = require('./display')

const PRELOAD = path.join(__dirname, '..', 'preload.js')
const KINDS = ['avatar', 'caption']

// Contrato do canal overlay:command — comando → tipo do argumento.
const COMMANDS = {
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
}
const PLAYER_METHODS = { play: 'string', setSpeed: 'number', setAvatar: 'string', stop: 'undefined' }
const CAPTION_KINDS = ['final', 'partial', 'state', 'clear']
const CAPTION_STATES = ['pending', 'signing', 'done', 'skipped']

function captionEvent(ev) {
  if (!ev || !CAPTION_KINDS.includes(ev.kind)) return null
  return {
    kind: ev.kind,
    seg: String(ev.seg ?? '').slice(0, 64),
    text: String(ev.text ?? '').slice(0, 2000),
    state: CAPTION_STATES.includes(ev.state) ? ev.state : undefined,
  }
}

class OverlayManager {
  constructor(getStudio) {
    this.getStudio = getStudio
    this.file = path.join(app.getPath('userData'), 'overlay.json')
    this.settings = S.load(this.file)
    this.active = false
    this.editing = true
    this.windows = { avatar: null, caption: null }
    this.applied = {}
    this.crashes = { avatar: 0, caption: 0 }
    this.shortcutFailures = []
    this.saveTimer = null
  }

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

  get engine() {
    return this.active && this.settings.avatar.visible ? 'overlay' : 'studio'
  }

  state() {
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

  broadcast() {
    const state = this.state()
    for (const wc of [this.getStudio()?.webContents, ...KINDS.map((k) => this.windows[k]?.webContents)]) {
      if (wc && !wc.isDestroyed()) wc.send('overlay:state', state)
    }
  }

  sendStudio(channel, ...args) {
    const wc = this.getStudio()?.webContents
    if (wc && !wc.isDestroyed()) wc.send(channel, ...args)
  }

  update(patch) {
    const before = this.settings
    this.settings = S.sanitize(patch, before)
    if (JSON.stringify(before.shortcuts) !== JSON.stringify(this.settings.shortcuts)) this.registerShortcuts()
    this.persist()
    this.sync()
    this.broadcast()
  }

  persist() {
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flush(), 300)
  }

  flush() {
    clearTimeout(this.saveTimer)
    try {
      S.save(this.file, this.settings)
    } catch (e) {
      console.error('Overlay: falha ao salvar configurações', e)
    }
  }

  // Cria/destrói janelas conforme o estado e reaplica posição, topo e modo de interação.
  sync() {
    for (const kind of KINDS) {
      const wanted = this.active && this.settings[kind].visible
      const win = this.windows[kind]
      if (wanted && !win) this.createWindow(kind)
      else if (!wanted && win) win.destroy()
      else if (win) this.applyWindow(kind)
    }
  }

  createWindow(kind) {
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
    win.loadURL(`app://sinalize/${page}`)
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
      if (kind === 'avatar') this.sendStudio('player:status', { status: null, speed: null })
      this.broadcast()
    })
  }

  applyWindow(kind) {
    const win = this.windows[kind]
    if (!win || win.isDestroyed()) return
    const { displayId, ...b } = this.bounds(kind)
    this.applied[kind] = b
    win.setBounds(b)
    // Cruzar monitores com escalas DPI diferentes pode reescalar a janela no Windows; reaplica o tamanho.
    const now = win.getBounds()
    if (now.width !== b.width || now.height !== b.height) win.setBounds(b)
    win.setAlwaysOnTop(kind === 'caption' || this.settings.avatar.alwaysOnTop, 'screen-saver')
    // Mantém os cliques disponíveis para a janela abaixo.
    win.setIgnoreMouseEvents(!this.editing && this.settings.behavior.clickThrough)
  }

  bounds(kind) {
    const el = this.settings[kind]
    const sizeFor = kind === 'avatar'
      ? (area) => S.avatarSize({ width: Math.min(el.width, area.width - 2 * MARGIN, (area.height - 2 * MARGIN) / S.AVATAR_RATIO) })
      : (area) => S.captionSize(el, area.width - 2 * MARGIN)
    return resolveBounds(el, sizeFor, screen.getAllDisplays(), screen.getPrimaryDisplay(), {
      useFullBounds: this.settings.behavior.useFullBounds,
      fallbackAnchor: S.DEFAULTS[kind].anchor,
    })
  }

  // Arrasto nativo (app-region) terminou: grava a posição livre e o monitor de destino.
  onMoved(kind) {
    const b = this.windows[kind]?.getBounds()
    const last = this.applied[kind]
    if (!b || (last && last.x === b.x && last.y === b.y)) return
    const display = displayForRect(b, screen.getAllDisplays()) || screen.getPrimaryDisplay()
    this.update({ [kind]: { anchor: 'custom', x: b.x, y: b.y, displayId: display.id } })
  }

  open() {
    if (this.active) return
    if (!this.settings.behavior.restoreLast) this.settings = S.resetLayout(this.settings)
    this.active = true
    this.editing = true
    this.crashes = { avatar: 0, caption: 0 }
    this.sync()
    this.broadcast()
  }

  close() {
    if (!this.active) return
    this.active = false
    this.sync()
    this.flush()
    this.broadcast()
  }

  setEditing(on) {
    this.editing = on
    this.sync()
    this.broadcast()
  }

  nextDisplay(kind) {
    const displays = screen.getAllDisplays().sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    const current = this.bounds(kind).displayId
    const next = displays[(displays.findIndex((d) => d.id === current) + 1) % displays.length]
    const el = this.settings[kind]
    this.update({ [kind]: { displayId: next.id, anchor: el.anchor === 'custom' ? S.DEFAULTS[kind].anchor : el.anchor, x: null, y: null } })
  }

  sendPlayer(method, arg) {
    const wc = this.windows.avatar?.webContents
    if (wc && !wc.isDestroyed()) wc.send('player:cmd', method, arg)
  }

  command(cmd, arg) {
    const s = this.settings
    switch (cmd) {
      case 'open': return this.open()
      case 'close': return this.close()
      case 'toggle': return this.active ? this.close() : this.open()
      case 'edit': return this.setEditing(arg)
      case 'toggleEdit':
        if (!this.active) return this.open()
        return this.setEditing(!this.editing)
      case 'reset': return this.update(S.resetLayout(s))
      case 'toggleAvatar': return this.update({ avatar: { visible: !s.avatar.visible } })
      case 'toggleCaption': return this.update({ caption: { visible: !s.caption.visible } })
      case 'applyPreset': return this.update(S.applyPreset(s, arg))
      case 'savePreset': return this.update(S.savePreset(s, arg.trim().slice(0, 40)))
      case 'deletePreset': return this.update(S.deletePreset(s, arg))
      case 'nextDisplay': return KINDS.includes(arg) && this.nextDisplay(arg)
      case 'resizeAvatar': {
        // Mantém o canto superior esquerdo fixo: a alça fica sob o cursor durante o arrasto.
        const b = this.windows.avatar?.getBounds()
        return this.update({ avatar: { width: arg, ...(b && { anchor: 'custom', x: b.x, y: b.y }) } })
      }
      case 'resizeCaption': {
        if (s.caption.anchor !== 'custom') return this.update({ caption: { maxWidth: arg } })
        const b = this.windows.caption?.getBounds()
        return this.update({ caption: { maxWidth: arg, ...(b && { x: b.x + Math.round((b.width - arg) / 2) }) } })
      }
      case 'focusStudio': {
        const studio = this.getStudio()
        if (!studio) return
        if (studio.isMinimized()) studio.restore()
        studio.show()
        studio.focus()
        return this.sendStudio('overlay:focus', String(arg))
      }
    }
  }

  registerShortcuts() {
    globalShortcut.unregisterAll()
    const handlers = {
      toggleOverlay: () => this.command('toggle'),
      toggleEdit: () => this.command('toggleEdit'),
      toggleAvatar: () => this.command('toggleAvatar'),
      toggleCaption: () => this.command('toggleCaption'),
      resetLayout: () => this.command('reset'),
      toggleMic: () => this.sendStudio('overlay:shortcut', 'toggleMic'),
    }
    this.shortcutFailures = []
    const seen = new Set()
    for (const action of S.SHORTCUT_ACTIONS) {
      const accel = this.settings.shortcuts[action]
      if (!accel) continue
      let ok = false
      try {
        // false: já registrado por outro app (ou repetido nesta lista); exceção: acelerador inválido.
        ok = !seen.has(accel.toLowerCase()) && globalShortcut.register(accel, handlers[action])
      } catch {}
      seen.add(accel.toLowerCase())
      if (!ok) this.shortcutFailures.push(action)
    }
  }

  registerIpc() {
    const isStudio = (e) => e.sender === this.getStudio()?.webContents
    const isOverlay = (e) => KINDS.some((k) => this.windows[k]?.webContents === e.sender)

    ipcMain.handle('overlay:get', () => this.state())

    ipcMain.handle('overlay:update', (e, patch) => {
      if (!isStudio(e)) throw new Error('overlay:update só é aceito do Studio')
      if (!patch || typeof patch !== 'object') throw new Error('patch inválido')
      this.update(patch)
      return this.state()
    })

    ipcMain.handle('overlay:command', (e, cmd, arg) => {
      if (!isStudio(e) && !isOverlay(e)) throw new Error('remetente desconhecido')
      if (!Object.hasOwn(COMMANDS, cmd) || typeof arg !== COMMANDS[cmd]) throw new Error(`comando inválido: ${cmd}`)
      this.command(cmd, arg)
      return this.state()
    })

    // Preserva a sessão ao alternar a saída do avatar: a fila no Studio comanda o Unity do overlay.
    ipcMain.on('player:cmd', (e, method, arg) => {
      if (isStudio(e) && Object.hasOwn(PLAYER_METHODS, method) && typeof arg === PLAYER_METHODS[method]) this.sendPlayer(method, arg)
    })

    ipcMain.on('player:status', (e, s) => {
      if (e.sender !== this.windows.avatar?.webContents) return
      const status = ['idle', 'playing', 'paused'].includes(s?.status) ? s.status : null
      this.sendStudio('player:status', { status, speed: Number.isFinite(s?.speed) ? s.speed : null })
    })

    ipcMain.on('caption:event', (e, ev) => {
      const clean = isStudio(e) && captionEvent(ev)
      const wc = this.windows.caption?.webContents
      if (clean && wc && !wc.isDestroyed()) wc.send('caption:event', clean)
    })
  }
}

module.exports = { OverlayManager }
