import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { BrowserWindow, Menu, app, dialog, ipcMain, net, protocol, screen, session } from 'electron'
import { IPC } from '../shared/api'
import { OverlayManager } from './overlay/overlay-manager'
import { PRELOAD, RENDERER_DIR, appOrigin, isAppUrl, pageUrl } from './pages'
import * as telemetry from './telemetry'

// Suprime erros de rede do Chromium (chunked upload do VLibras)
app.commandLine.appendSwitch('log-level', '3')

// Registra protocolo 'app' como seguro (necessário para microfone / mídia)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, allowServiceWorkers: true },
  },
])

const TRANSLATE_URL = 'https://traducao2.vlibras.gov.br/translate'

let mainWindow: BrowserWindow | null = null
const overlay = new OverlayManager(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))

async function createWindows() {
  // Oculta a barra de menu padrão do sistema (File, Edit, View, Window, Help)
  Menu.setApplicationMenu(null)

  // app://sinalize/<arquivo> → out/renderer/<arquivo>, sem sair da pasta do renderer.
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    const file = path.normalize(path.join(RENDERER_DIR, decodeURIComponent(pathname === '/' ? '/studio.html' : pathname)))
    if (!file.startsWith(RENDERER_DIR)) return new Response('Não encontrado', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })

  // Só o microfone, só para as páginas do app: o iframe de terceiros (player Unity) não herda permissões.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    const audioOnly = 'mediaTypes' in details && (details.mediaTypes ?? []).every((t) => t === 'audio')
    callback(permission === 'media' && audioOnly && isAppUrl(details.requestingUrl || wc.getURL()))
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => permission === 'media' && isAppUrl(origin))

  // O servidor local de transcrição (speaches) não envia CORS; libera só ele e só para o app.
  session.defaultSession.webRequest.onHeadersReceived({ urls: ['http://localhost:8000/*', 'http://127.0.0.1:8000/*'] }, (details, callback) => {
    const responseHeaders = { ...details.responseHeaders }
    for (const h of Object.keys(responseHeaders)) {
      if (h.toLowerCase() === 'access-control-allow-origin') delete responseHeaders[h]
    }
    responseHeaders['Access-Control-Allow-Origin'] = [appOrigin()]
    callback({ responseHeaders })
  })

  // Janela principal (1180x740 centralizada, adaptada a telas menores)
  const { width: screenWidth, height: screenHeight, x: screenX, y: screenY } = screen.getPrimaryDisplay().workArea
  const winWidth = Math.min(1180, Math.max(920, screenWidth - 32))
  const winHeight = Math.min(740, Math.max(600, screenHeight - 32))

  mainWindow = new BrowserWindow({
    x: screenX + Math.max(0, Math.round((screenWidth - winWidth) / 2)),
    y: screenY + Math.max(0, Math.round((screenHeight - winHeight) / 2)),
    width: winWidth,
    height: winHeight,
    minWidth: 920,
    minHeight: 600,
    title: 'Sinalize — Tradutor de Libras em Tempo Real',
    autoHideMenuBar: true,
    backgroundColor: '#F8FAFC',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false, // gravação contínua e fila do avatar seguem com a janela minimizada
    },
  })
  mainWindow.setMenuBarVisibility(false)
  await mainWindow.loadURL(pageUrl('studio.html'))

  mainWindow.on('closed', () => {
    mainWindow = null
    overlay.close()
    if (diagWindow && !diagWindow.isDestroyed()) diagWindow.close()
  })
}

// O serviço de tradução não envia CORS; a requisição sai do processo principal.
ipcMain.handle(IPC.translate, async (_e, text: unknown) => {
  if (typeof text !== 'string' || !text.trim() || text.length > 5000) throw new Error('texto inválido')
  const res = await net.fetch(TRANSLATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.text()
  // Mesmo tratamento do widget oficial: texto puro ou JSON { traducao }.
  try {
    return (JSON.parse(body) as { traducao?: string }).traducao || body
  } catch {
    return body
  }
})

// === Telemetria e painel de diagnóstico (Ctrl+Shift+D na janela principal) ===
const nowMs = () => performance.timeOrigin + performance.now()
const telEvents: telemetry.TelEvent[] = []
interface SystemSample {
  t: number
  cpuPct: number | null
  appCpuPct: number
  appRamMB: number
  ramUsedMB: number
  ramTotalMB: number
  gpu: { util: number; usedMB: number; totalMB: number } | null
}
const telSystem: SystemSample[] = []
let diagWindow: BrowserWindow | null = null
let sysTimer: NodeJS.Timeout | undefined
let prevCpu: { idle: number; total: number } | null = null

ipcMain.on(IPC.telemetry, (_e, ev: telemetry.TelEvent) => {
  if (ev && typeof ev.t === 'number' && typeof ev.type === 'string') telemetry.push(telEvents, ev)
})

function cpuPercent() {
  const c = os.cpus().reduce(
    (a, { times: t }) => {
      a.idle += t.idle
      a.total += t.user + t.nice + t.sys + t.idle + t.irq
      return a
    },
    { idle: 0, total: 0 },
  )
  const pct = prevCpu ? 100 * (1 - (c.idle - prevCpu.idle) / (c.total - prevCpu.total)) : null
  prevCpu = c
  return pct == null ? null : Math.round(pct)
}

// Amostra CPU/RAM do sistema e do app + GPU/VRAM (nvidia-smi), só com o painel aberto
function sampleSystem() {
  const metrics = app.getAppMetrics()
  const sample: SystemSample = {
    t: nowMs(),
    cpuPct: cpuPercent(),
    appCpuPct: Math.round(metrics.reduce((n, m) => n + m.cpu.percentCPUUsage, 0)),
    appRamMB: Math.round(metrics.reduce((n, m) => n + m.memory.workingSetSize, 0) / 1024),
    ramUsedMB: Math.round((os.totalmem() - os.freemem()) / 1048576),
    ramTotalMB: Math.round(os.totalmem() / 1048576),
    gpu: null,
  }
  execFile(
    'nvidia-smi',
    ['--query-gpu=utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'],
    { timeout: 1500, windowsHide: true },
    (err, out) => {
      if (!err) {
        const [util = 0, usedMB = 0, totalMB = 0] = out.trim().split(/,\s*/).map(Number)
        sample.gpu = { util, usedMB, totalMB }
      }
      telemetry.push(telSystem, sample)
    },
  )
}

function openDiagnostics() {
  if (diagWindow && !diagWindow.isDestroyed()) return diagWindow.focus()
  diagWindow = new BrowserWindow({
    width: 900,
    height: 760,
    title: 'Sinalize — Diagnóstico',
    autoHideMenuBar: true,
    backgroundColor: '#0b0d14',
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
  })
  void diagWindow.loadURL(pageUrl('diag.html'))
  sampleSystem()
  sysTimer = setInterval(sampleSystem, 2000)
  diagWindow.on('closed', () => {
    clearInterval(sysTimer)
    diagWindow = null
  })
}

ipcMain.on(IPC.diagOpen, openDiagnostics)

ipcMain.handle(IPC.diagSnapshot, () => {
  const now = nowMs()
  return {
    now,
    summary: telemetry.summary(telEvents, now),
    metrics: telemetry.METRICS,
    segments: telemetry.segments(telEvents).slice(-40),
    system: telSystem.at(-1) ?? null,
  }
})

ipcMain.handle(IPC.diagExport, async (_e, format: unknown) => {
  if (format !== 'json' && format !== 'csv') throw new Error('formato inválido')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const options = {
    defaultPath: `sinalize-diagnostico-${stamp}.${format}`,
    filters: [{ name: format.toUpperCase(), extensions: [format] }],
  }
  const { canceled, filePath } = diagWindow ? await dialog.showSaveDialog(diagWindow, options) : await dialog.showSaveDialog(options)
  if (canceled || !filePath) return null
  const segs = telemetry.segments(telEvents)
  const content = format === 'csv'
    ? telemetry.toCSV(segs)
    : JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          clock: 'ms epoch alta resolução (performance.timeOrigin + performance.now())',
          summary: telemetry.summary(telEvents, nowMs()),
          segments: segs,
          events: telEvents,
          system: telSystem,
        },
        null,
        2,
      )
  fs.writeFileSync(filePath, content, 'utf8')
  return filePath
})

ipcMain.handle(IPC.diagReset, () => {
  telEvents.length = 0
  telSystem.length = 0
})

void app.whenReady().then(() => {
  overlay.init()
  return createWindows()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
