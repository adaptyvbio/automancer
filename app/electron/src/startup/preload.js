const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getHostSettings: async () => {
    return await ipcRenderer.invoke('get-host-settings');
  },
  launchHost: (settingsId) => {
    ipcRenderer.send('launch-host', settingsId);
  },
  ready: () => {
    ipcRenderer.send('ready');
  }
});
