const { app, BrowserWindow, ipcMain, session, protocol, net } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')

// Suprime erros de rede do Chromium (chunked upload do VLibras)
app.commandLine.appendSwitch('log-level', '3')

// Registra protocolo 'app' como seguro (necessário para SpeechRecognition)
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

let controlWindow
let avatarWindow

async function createWindows() {
  // Registra o handler do protocolo 'app://'
  protocol.handle('app', (request) => {
    const url = new URL(request.url)
    let filePath = path.join(__dirname, 'renderer', url.pathname)

    // Fallback para control.html na raiz
    if (url.pathname === '/' || url.pathname === '') {
      filePath = path.join(__dirname, 'renderer', 'control.html')
    }

    return net.fetch(pathToFileURL(filePath).toString())
  })

  // Concede todas as permissões automaticamente (microfone, etc.)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true)
  })
  session.defaultSession.setPermissionCheckHandler(() => {
    return true
  })

  controlWindow = new BrowserWindow({
    width: 500,
    height: 420,
    title: 'Sinalize — Controle',
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  })

  // Carrega via protocolo seguro 'app://' para SpeechRecognition funcionar
  controlWindow.loadURL('app://sinalize/control.html')

  avatarWindow = new BrowserWindow({
    width: 900,
    height: 650,
    title: 'Sinalize — Avatar',
    webPreferences: {
      contextIsolation: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      nodeIntegration: true
    }
  })

  // Remove CSP para permitir VLibras
  avatarWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders }
    delete responseHeaders['Content-Security-Policy']
    delete responseHeaders['content-security-policy']
    callback({ responseHeaders })
  })

  avatarWindow.loadFile('renderer/avatar.html')
}

ipcMain.on('translate', (event, text) => {
  if (avatarWindow && !avatarWindow.isDestroyed()) {
    avatarWindow.webContents.send('translate', text)
  }
})

app.whenReady().then(createWindows)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
