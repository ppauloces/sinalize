const { app, BrowserWindow, ipcMain, session, protocol, net, screen, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')

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
      nodeIntegration: true
    }
  })

  // Remove CSP para permitir carregamento de scripts externos do VLibras
  avatarWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders }
    delete responseHeaders['Content-Security-Policy']
    delete responseHeaders['content-security-policy']
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
      contextIsolation: true
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
  })
}

// === Comunicação IPC ===

// Envio de texto para o avatar
ipcMain.on('translate', (event, text) => {
  if (avatarWindow && !avatarWindow.isDestroyed()) {
    avatarWindow.webContents.send('translate', text)
  }
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
