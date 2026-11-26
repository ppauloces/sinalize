import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { BrowserWindow, Menu, app, ipcMain, net, protocol, session } from 'electron'
import { IPC, type AppInfo } from '../shared/ipc'
import { translateTextSchema } from '../shared/schemas'
import { RENDERER_DIR, appOrigin, isAppUrl } from './pages'
import { registerDiagnosticsIpc } from './services/diagnostics'
import { OutputManager } from './services/output-manager'
import { SystemMetricsSampler } from './services/system-metrics'
import { createStudioWindow, registerStudioWindowIpc } from './windows/studio.window'

// Testes automatizados usam um perfil isolado (configurações, localStorage e atalhos do usuário intactos).
if (process.env.SINALIZE_USER_DATA) app.setPath('userData', process.env.SINALIZE_USER_DATA)

// Suprime erros de rede do Chromium (chunked upload do VLibras)
app.commandLine.appendSwitch('log-level', '3')

// Registra protocolo 'app' como seguro (necessário para microfone / mídia)
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, allowServiceWorkers: true } },
])

const TRANSLATE_URL = 'https://traducao2.vlibras.gov.br/translate'

let studio: BrowserWindow | null = null
const getStudio = () => (studio && !studio.isDestroyed() ? studio : null)
const outputs = new OutputManager(getStudio)
const metrics = new SystemMetricsSampler()

function configureSession() {
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
}

function registerAppIpc() {
  // O serviço de tradução não envia CORS; a requisição sai do processo principal.
  ipcMain.handle(IPC.translate, async (_e, text: unknown) => {
    const res = await net.fetch(TRANSLATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: translateTextSchema.parse(text) }),
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

  ipcMain.handle(IPC.appInfo, (): AppInfo => ({ version: app.getVersion(), electron: process.versions.electron, platform: process.platform }))
  registerStudioWindowIpc(getStudio)
  registerDiagnosticsIpc(() => metrics.latest)
}

void app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  configureSession()
  registerAppIpc()
  outputs.init()
  studio = createStudioWindow()
  metrics.start((m) => getStudio()?.webContents.send(IPC.systemMetrics, m))
  studio.on('closed', () => {
    studio = null
    metrics.stop()
    outputs.closeAll()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
