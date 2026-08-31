const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('sinalize', {
  // Envia o texto para o avatar
  translate: (text) => ipcRenderer.send('translate', text),
})