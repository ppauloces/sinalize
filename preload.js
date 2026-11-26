const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('sinalize', {
  // Envia o texto para a janela do avatar (meta.seg = id do segmento, para a telemetria)
  translate: (text, meta) => ipcRenderer.send('translate', text, meta),

  // Telemetria: { t, src, type, seg, data } → processo principal
  telemetry: (ev) => ipcRenderer.send('telemetry', ev),

  // Painel de diagnóstico (janela própria)
  openDiagnostics: () => ipcRenderer.send('diag:open'),
  diag: {
    snapshot: () => ipcRenderer.invoke('diag:snapshot'),
    export: (format) => ipcRenderer.invoke('diag:export', format),
    reset: () => ipcRenderer.invoke('diag:reset'),
  },

  // Legenda provisória enquanto a frase ainda está sendo falada (não sinaliza)
  partial: (text, meta) => ipcRenderer.send('partial', text, meta),

  // Fila do avatar: estado (atraso/pendentes) e esvaziamento manual pelo operador
  onAvatarState: (fn) => ipcRenderer.on('avatar:state', (event, state) => fn(state)),
  flushAvatarQueue: () => ipcRenderer.send('avatar:flush'),

  // Alterna o modo "Sempre no Topo" da janela do Avatar
  toggleAlwaysOnTop: (flag) => ipcRenderer.invoke('toggle-always-on-top', flag),

  // Notifica o status de gravação para a janela do Avatar (badge Ao vivo / Pronto)
  setRecordingStatus: (isRecording) => ipcRenderer.send('recording-status', isRecording),
})
