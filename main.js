const { app, BrowserWindow, ipcMain, session, protocol, net, screen, Menu, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { execFile } = require('child_process')
const { performance } = require('perf_hooks')
const { pathToFileURL } = require('url')
const telemetry = require('./telemetry')

// Suprime erros de rede do Chromium (chunked upload do VLibras)
app.commandLine.appendSwitch('log-level', '3')

// Registra protocolo 'app' como seguro (necessário para SpeechRecognition / mídia)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      allowServiceWorkers: true
    }
  }
])

let controlWindow = null
let avatarWindow = null

async function createWindows() {
  // Oculta a barra de menu padrão do sistema (File, Edit, View...)
  Menu.setApplicationMenu(null)

  // Registra o handler do protocolo 'app://' com pathToFileURL
  protocol.handle('app', (request) => {
    const url = new URL(request.url)
    let filePath = path.join(__dirname, 'renderer', url.pathname)

    // Fallback para control.html na raiz
    if (url.pathname === '/' || url.pathname === '') {
      filePath = path.join(__dirname, 'renderer', 'control.html')
    }

    return net.fetch(pathToFileURL(filePath).toString())
  })

  // Concede todas as permissões de mídia (microfone, etc.)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true)
  })
  session.defaultSession.setPermissionCheckHandler(() => {
    return true
  })

  // Dimensões definidas para exibição lado a lado refinada
  const avatarWidth = 460
  const controlWidth = 420
  const windowHeight = 680
  const gap = 16

  // Calcula posicionamento automático lado a lado centralizado na tela
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight, x: screenX, y: screenY } = primaryDisplay.workArea

  const totalWidth = avatarWidth + controlWidth + gap
  const startX = screenX + Math.max(0, Math.round((screenWidth - totalWidth) / 2))
  const startY = screenY + Math.max(0, Math.round((screenHeight - windowHeight) / 2))

  // 1. Janela do Avatar (Esquerda)
  avatarWindow = new BrowserWindow({
    x: startX,
    y: startY,
    width: avatarWidth,
    height: windowHeight,
    minWidth: 380,
    minHeight: 520,
    title: 'Sinalize — Avatar',
    autoHideMenuBar: true,
    backgroundColor: '#0b0d14',
    webPreferences: {
      contextIsolation: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      nodeIntegration: true,
      backgroundThrottling: false // a fila e a medição seguem com a janela oculta/minimizada
    }
  })

  // Remove CSP para permitir carregamento de scripts externos do VLibras
  avatarWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders }
    delete responseHeaders['Content-Security-Policy']
    delete responseHeaders['content-security-policy']

    // Servidor de transcrição local (speaches) não envia CORS: libera para a janela de controle
    if (/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(details.url)) {
      for (const h of Object.keys(responseHeaders)) {
        if (h.toLowerCase() === 'access-control-allow-origin') delete responseHeaders[h]
      }
      responseHeaders['Access-Control-Allow-Origin'] = ['*']
    }
    callback({ responseHeaders })
  })

  avatarWindow.loadFile('renderer/avatar.html')

  // 2. Janela de Controle (Direita)
  controlWindow = new BrowserWindow({
    x: startX + avatarWidth + gap,
    y: startY,
    width: controlWidth,
    height: windowHeight,
    minWidth: 380,
    minHeight: 580,
    title: 'Sinalize — Controle',
    resizable: true,
    autoHideMenuBar: true,
    backgroundColor: '#0b0d14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      backgroundThrottling: false // gravação contínua segue com a janela minimizada
    }
  })

  // Carrega via protocolo seguro 'app://'
  controlWindow.loadURL('app://sinalize/control.html')

  // Fecha ambas as janelas caso uma seja fechada
  avatarWindow.on('closed', () => {
    avatarWindow = null
    if (controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.close()
    }
  })

  controlWindow.on('closed', () => {
    controlWindow = null
    if (avatarWindow && !avatarWindow.isDestroyed()) {
      avatarWindow.close()
    }
    if (diagWindow && !diagWindow.isDestroyed()) diagWindow.close()
  })
}

// === Comunicação IPC ===

// Envio de texto para o avatar
ipcMain.on('translate', (event, text, meta) => {
  if (avatarWindow && !avatarWindow.isDestroyed()) {
    avatarWindow.webContents.send('translate', text, meta)
  }
})

ipcMain.on('partial', (event, text, meta) => {
  if (avatarWindow && !avatarWindow.isDestroyed()) {
    avatarWindow.webContents.send('partial', text, meta)
  }
})

// Operador esvazia a fila do avatar (cada item sai registrado na telemetria)
ipcMain.on('avatar:flush', () => {
  if (avatarWindow && !avatarWindow.isDestroyed()) avatarWindow.webContents.send('avatar:flush')
})

// Estado da fila do avatar (atraso, pendentes) → janela de controle
ipcMain.on('avatar:state', (event, state) => {
  if (controlWindow && !controlWindow.isDestroyed()) controlWindow.webContents.send('avatar:state', state)
})

// === Telemetria e painel de diagnóstico (Ctrl+Shift+D na janela de controle) ===
const nowMs = () => performance.timeOrigin + performance.now()
const telEvents = []
const telSystem = []
let diagWindow = null
let sysTimer = null
let prevCpu = null

ipcMain.on('telemetry', (event, ev) => telemetry.push(telEvents, ev))

function cpuPercent() {
  const c = os.cpus().reduce((a, { times: t }) => {
    a.idle += t.idle
    a.total += t.user + t.nice + t.sys + t.idle + t.irq
    return a
  }, { idle: 0, total: 0 })
  const pct = prevCpu ? 100 * (1 - (c.idle - prevCpu.idle) / (c.total - prevCpu.total)) : null
  prevCpu = c
  return pct == null ? null : Math.round(pct)
}

// Amostra CPU/RAM do sistema e do app + GPU/VRAM (nvidia-smi), só com o painel aberto
function sampleSystem() {
  const metrics = app.getAppMetrics()
  const sample = {
    t: nowMs(),
    cpuPct: cpuPercent(),
    appCpuPct: Math.round(metrics.reduce((n, m) => n + m.cpu.percentCPUUsage, 0)),
    appRamMB: Math.round(metrics.reduce((n, m) => n + m.memory.workingSetSize, 0) / 1024),
    ramUsedMB: Math.round((os.totalmem() - os.freemem()) / 1048576),
    ramTotalMB: Math.round(os.totalmem() / 1048576),
    gpu: null,
  }
  execFile('nvidia-smi', ['--query-gpu=utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
    { timeout: 1500, windowsHide: true }, (err, out) => {
      if (!err) {
        const [util, usedMB, totalMB] = out.trim().split(/,\s*/).map(Number)
        sample.gpu = { util, usedMB, totalMB }
      }
      telemetry.push(telSystem, sample)
    })
}

function openDiagnostics() {
  if (diagWindow && !diagWindow.isDestroyed()) return diagWindow.focus()
  diagWindow = new BrowserWindow({
    width: 900,
    height: 760,
    title: 'Sinalize — Diagnóstico',
    autoHideMenuBar: true,
    backgroundColor: '#0b0d14',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  })
  diagWindow.loadURL('app://sinalize/diag.html')
  sampleSystem()
  sysTimer = setInterval(sampleSystem, 2000)
  diagWindow.on('closed', () => {
    clearInterval(sysTimer)
    diagWindow = null
  })
}

ipcMain.on('diag:open', openDiagnostics)

ipcMain.handle('diag:snapshot', () => {
  const now = nowMs()
  return {
    now,
    summary: telemetry.summary(telEvents, now),
    metrics: telemetry.METRICS,
    segments: telemetry.segments(telEvents).slice(-40),
    system: telSystem.at(-1) || null,
  }
})

ipcMain.handle('diag:export', async (event, format) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const { canceled, filePath } = await dialog.showSaveDialog(diagWindow, {
    defaultPath: `sinalize-diagnostico-${stamp}.${format}`,
    filters: [{ name: format.toUpperCase(), extensions: [format] }]
  })
  if (canceled || !filePath) return null
  const segs = telemetry.segments(telEvents)
  const content = format === 'csv'
    ? telemetry.toCSV(segs)
    : JSON.stringify({
      exportedAt: new Date().toISOString(),
      clock: 'ms epoch alta resolução (performance.timeOrigin + performance.now())',
      summary: telemetry.summary(telEvents, nowMs()),
      segments: segs,
      events: telEvents,
      system: telSystem,
    }, null, 2)
  fs.writeFileSync(filePath, content, 'utf8')
  return filePath
})

ipcMain.handle('diag:reset', () => {
  telEvents.length = 0
  telSystem.length = 0
})

// Alterna estado de "Always on Top" da janela do Avatar
ipcMain.handle('toggle-always-on-top', (event, flag) => {
  if (avatarWindow && !avatarWindow.isDestroyed()) {
    const current = avatarWindow.isAlwaysOnTop()
    const nextState = typeof flag === 'boolean' ? flag : !current
    avatarWindow.setAlwaysOnTop(nextState, 'screen-saver')
    return nextState
  }
  return false
})

// Sincroniza status de gravação (Ao vivo / Pronto) com a janela do avatar
ipcMain.on('recording-status', (event, isRecording) => {
  if (avatarWindow && !avatarWindow.isDestroyed()) {
    avatarWindow.webContents.send('recording-status', isRecording)
  }
})

app.whenReady().then(createWindows)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
