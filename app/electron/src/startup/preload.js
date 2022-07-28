const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getHostSettings: async () => {
    return await ipcRenderer.invoke('get-host-settings');
  },
  ready: () => {
    ipcRenderer.send('ready');
  }
});
