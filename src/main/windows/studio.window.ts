import { BrowserWindow, ipcMain, nativeTheme, screen } from 'electron'
import { IPC } from '../../shared/ipc'
import { themeSchema } from '../../shared/schemas'
import { PRELOAD, pageUrl } from '../pages'

export const TITLE_BAR_HEIGHT = 36

// Cores dos botões nativos (minimizar/maximizar/fechar) sobre a barra de título própria.
const TITLE_BAR = {
  dark: { color: '#17181B', symbolColor: '#A1A1AA', height: TITLE_BAR_HEIGHT },
  light: { color: '#F1F1F2', symbolColor: '#52525B', height: TITLE_BAR_HEIGHT },
} as const

export function createStudioWindow() {
  const { width: sw, height: sh, x: sx, y: sy } = screen.getPrimaryDisplay().workArea
  const width = Math.min(1600, Math.max(1024, sw - 48))
  const height = Math.min(960, Math.max(700, sh - 48))

  const win = new BrowserWindow({
    x: sx + Math.round((sw - width) / 2),
    y: sy + Math.round((sh - height) / 2),
    width,
    height,
    minWidth: 1024,
    minHeight: 700,
    title: 'Sinalize Studio',
    show: false,
    backgroundColor: '#111214',
    // Barra de título desenhada pelo app; o Windows mantém só os botões nativos sobrepostos.
    titleBarStyle: 'hidden',
    titleBarOverlay: TITLE_BAR.dark,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false, // captura contínua e fila seguem com a janela minimizada
    },
  })

  // Testes automatizados abrem o Studio sem tirar o foco do usuário.
  win.once('ready-to-show', () => (process.env.SINALIZE_E2E ? win.showInactive() : win.show()))
  void win.loadURL(pageUrl('studio.html'))
  return win
}

export function registerStudioWindowIpc(getStudio: () => BrowserWindow | null) {
  ipcMain.on(IPC.windowTheme, (e, theme: unknown) => {
    const studio = getStudio()
    const parsed = themeSchema.safeParse(theme)
    if (!studio || e.sender !== studio.webContents || !parsed.success) return
    nativeTheme.themeSource = parsed.data
    studio.setTitleBarOverlay(TITLE_BAR[parsed.data])
    studio.setBackgroundColor(parsed.data === 'dark' ? '#111214' : '#E7E8EA')
  })
}
