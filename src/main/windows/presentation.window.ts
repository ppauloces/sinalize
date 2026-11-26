import { BrowserWindow, screen } from 'electron'
import type { PresentationSettings } from '../../shared/output'
import { PRELOAD, pageUrl } from '../pages'

// Telão: com dois ou mais monitores vai em tela cheia no secundário; com um só, abre em janela
// para não cobrir o Studio (o operador precisa continuar controlando a sessão).
export function presentationTarget(settings: PresentationSettings) {
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  const chosen = displays.find((d) => d.id === settings.displayId)
  const display = chosen ?? displays.find((d) => d.id !== primary.id) ?? primary
  return { display, fullscreen: settings.fullscreen && displays.length > 1 }
}

export function createPresentationWindow(settings: PresentationSettings) {
  const { display, fullscreen } = presentationTarget(settings)
  const { x, y, width, height } = display.workArea
  const winWidth = Math.min(1280, width - 80)
  const winHeight = Math.min(760, height - 80)

  const win = new BrowserWindow({
    title: 'Sinalize — Telão',
    x: fullscreen ? display.bounds.x : x + Math.round((width - winWidth) / 2),
    y: fullscreen ? display.bounds.y : y + Math.round((height - winHeight) / 2),
    width: fullscreen ? display.bounds.width : winWidth,
    height: fullscreen ? display.bounds.height : winHeight,
    show: false,
    frame: !fullscreen,
    autoHideMenuBar: true,
    backgroundColor: settings.background,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  win.setMenuBarVisibility(false)
  win.once('ready-to-show', () => {
    if (fullscreen) win.setFullScreen(true)
    // A projeção não deve roubar o foco do Studio do operador.
    win.showInactive()
  })
  void win.loadURL(pageUrl('presentation.html'))
  return win
}
