const { contextBridge, ipcRenderer } = require('electron')

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
})
