const { contextBridge, ipcRenderer } = require('electron')

// Assina um canal e devolve a função de cleanup do listener.
const on = (channel, cb) => {
  const listener = (_event, ...args) => cb(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('sinalize', {
  // Telemetria: { t, src, type, seg, data } → processo principal
  telemetry: (ev) => ipcRenderer.send('telemetry', ev),

  // Painel de diagnóstico (janela própria — Ctrl+Shift+D)
  openDiagnostics: () => ipcRenderer.send('diag:open'),
  diag: {
    snapshot: () => ipcRenderer.invoke('diag:snapshot'),
    export: (format) => ipcRenderer.invoke('diag:export', format),
    reset: () => ipcRenderer.invoke('diag:reset'),
  },

  // Alterna o modo "Sempre no Topo" (Always on Top) da janela principal
  toggleAlwaysOnTop: (flag) => ipcRenderer.invoke('toggle-always-on-top', flag),

  // Modo Overlay (contrato e validação em main/overlay-manager.js)
  overlay: {
    get: () => ipcRenderer.invoke('overlay:get'),
    update: (patch) => ipcRenderer.invoke('overlay:update', patch),
    command: (cmd, arg) => ipcRenderer.invoke('overlay:command', cmd, arg),
    onState: (cb) => on('overlay:state', cb),
    onFocus: (cb) => on('overlay:focus', cb),
    onShortcut: (cb) => on('overlay:shortcut', cb),
  },

  // Motor de sinalização no overlay: o Studio comanda, a janela do avatar reporta o estado.
  player: {
    cmd: (method, arg) => ipcRenderer.send('player:cmd', method, arg),
    onCmd: (cb) => on('player:cmd', cb),
    status: (s) => ipcRenderer.send('player:status', s),
    onStatus: (cb) => on('player:status', cb),
  },

  // Legendas flutuantes: eventos da legenda do Studio repassados à janela de legendas.
  caption: {
    push: (ev) => ipcRenderer.send('caption:event', ev),
    onEvent: (cb) => on('caption:event', cb),
  },
})
