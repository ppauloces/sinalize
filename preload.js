const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('sinalize', {
  // Envia o texto para a janela do avatar
  translate: (text) => ipcRenderer.send('translate', text),

  // Alterna o modo "Sempre no Topo" da janela do Avatar
  toggleAlwaysOnTop: (flag) => ipcRenderer.invoke('toggle-always-on-top', flag),

  // Notifica o status de gravação para a janela do Avatar (badge Ao vivo / Pronto)
  setRecordingStatus: (isRecording) => ipcRenderer.send('recording-status', isRecording),
})
