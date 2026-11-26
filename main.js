const { app, BrowserWindow, ipcMain, session, protocol, net, screen, Menu, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { execFile } = require('child_process')
const { performance } = require('perf_hooks')
const { pathToFileURL } = require('url')
const telemetry = require('./telemetry')
const { OverlayManager } = require('./main/overlay-manager')

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

let mainWindow = null
const overlay = new OverlayManager(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))

async function createWindows() {
  // Oculta a barra de menu padrão do sistema (File, Edit, View, Window, Help)
  Menu.setApplicationMenu(null)

  // Registra o handler do protocolo 'app://' com pathToFileURL
  protocol.handle('app', (request) => {
    const url = new URL(request.url)
    let filePath = path.join(__dirname, 'renderer', url.pathname)

    // Fallback para a interface principal unificada na raiz
    if (url.pathname === '/' || url.pathname === '') {
      filePath = path.join(__dirname, 'renderer', 'index.html')
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

  // Remove CSP para permitir scripts externos do VLibras e libera CORS para servidor local (speaches)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders }
    delete responseHeaders['Content-Security-Policy']
    delete responseHeaders['content-security-policy']

    if (/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(details.url)) {
      for (const h of Object.keys(responseHeaders)) {
        if (h.toLowerCase() === 'access-control-allow-origin') delete responseHeaders[h]
      }
      responseHeaders['Access-Control-Allow-Origin'] = ['*']
    }
    callback({ responseHeaders })
  })

  // Dimensões da janela principal unificada (1180x740 centralizada, adaptada a telas menores)
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width: screenWidth, height: screenHeight, x: screenX, y: screenY } = primaryDisplay.workArea

  const winWidth = Math.min(1180, Math.max(920, screenWidth - 32))
  const winHeight = Math.min(740, Math.max(600, screenHeight - 32))
  const startX = screenX + Math.max(0, Math.round((screenWidth - winWidth) / 2))
  const startY = screenY + Math.max(0, Math.round((screenHeight - winHeight) / 2))

  // Janela Principal Unificada (Palco do Avatar + Painel de Controle)
  mainWindow = new BrowserWindow({
    x: startX,
    y: startY,
    width: winWidth,
    height: winHeight,
    minWidth: 920,
    minHeight: 600,
    title: 'Sinalize — Tradutor de Libras em Tempo Real',
    resizable: true,
    autoHideMenuBar: true,
    backgroundColor: '#F8FAFC',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
      backgroundThrottling: false // gravação contínua e fila do avatar seguem com a janela minimizada
    }
  })

  // Garante ocultação da barra de menu nativa mesmo pressionando Alt
  mainWindow.setMenuBarVisibility(false)

  // Carrega a interface unificada via protocolo seguro 'app://'
  mainWindow.loadURL('app://sinalize/index.html')

  mainWindow.on('closed', () => {
    mainWindow = null
    overlay.close()
    if (diagWindow && !diagWindow.isDestroyed()) diagWindow.close()
  })
}

// === Telemetria e painel de diagnóstico (Ctrl+Shift+D na janela principal) ===
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

// Alterna estado de "Always on Top" da janela principal unificada
ipcMain.handle('toggle-always-on-top', (event, flag) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const current = mainWindow.isAlwaysOnTop()
    const nextState = typeof flag === 'boolean' ? flag : !current
    mainWindow.setAlwaysOnTop(nextState, 'screen-saver')
    return nextState
  }
  return false
})

app.whenReady().then(() => {
  overlay.init()
  return createWindows()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
