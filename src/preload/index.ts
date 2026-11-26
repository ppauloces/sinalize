import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type SinalizeApi } from '../shared/ipc'

// Assina um canal e devolve a função de cleanup do listener.
function on<A extends unknown[]>(channel: string, cb: (...args: A) => void) {
  const listener = (_event: IpcRendererEvent, ...args: unknown[]) => cb(...(args as A))
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: SinalizeApi = {
  telemetry: (ev) => ipcRenderer.send(IPC.telemetry, ev),
  diag: {
    snapshot: () => ipcRenderer.invoke(IPC.diagSnapshot),
    export: (format) => ipcRenderer.invoke(IPC.diagExport, format),
    reset: () => ipcRenderer.invoke(IPC.diagReset),
  },
  system: {
    onMetrics: (cb) => on(IPC.systemMetrics, cb),
  },
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
    setTheme: (theme) => ipcRenderer.send(IPC.windowTheme, theme),
  },
  translate: (text) => ipcRenderer.invoke(IPC.translate, text),
  output: {
    get: () => ipcRenderer.invoke(IPC.outputGet),
    update: (patch) => ipcRenderer.invoke(IPC.outputUpdate, patch),
    command: (cmd, ...arg) => ipcRenderer.invoke(IPC.outputCommand, cmd, ...arg),
    onState: (cb) => on(IPC.outputState, cb),
    onFocus: (cb) => on(IPC.outputFocus, cb),
    onShortcut: (cb) => on(IPC.outputShortcut, cb),
  },
  player: {
    cmd: (method, ...arg) => ipcRenderer.send(IPC.playerCmd, method, ...arg),
    onCmd: (cb) => on(IPC.playerCmd, cb),
    status: (state) => ipcRenderer.send(IPC.playerStatus, state),
    onStatus: (cb) => on(IPC.playerStatus, cb),
  },
  caption: {
    push: (ev) => ipcRenderer.send(IPC.captionEvent, ev),
    onEvent: (cb) => on(IPC.captionEvent, cb),
  },
}

contextBridge.exposeInMainWorld('sinalize', api)
