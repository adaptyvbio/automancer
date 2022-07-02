const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('backendAPI', {
  onMessage: (callback) => {
    ipcRenderer.on('host:message', (event, message) => {
      callback(message);
    });
  },
  ready: () => {
    ipcRenderer.send('ready');
  },
  sendMessage: (message) => {
    ipcRenderer.send('host:message', message);
  }
});
