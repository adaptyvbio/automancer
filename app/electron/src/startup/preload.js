const { contextBridge, ipcRenderer } = require('electron');


contextBridge.exposeInMainWorld('common', {
  isDarwin: (process.platform === 'darwin')
});

contextBridge.exposeInMainWorld('api', {
  launchHost: (settingsId) => {
    ipcRenderer.send('launch-host', settingsId);
  },
  ready: () => {
    ipcRenderer.send('ready');
  },

  hostSettings: {
    create: async (options) => await ipcRenderer.invoke('hostSettings.create', options),
    delete: async (options) => await ipcRenderer.invoke('hostSettings.delete', options),
    query: async () => await ipcRenderer.invoke('hostSettings.query'),
    setDefault: async (options) => await ipcRenderer.invoke('hostSettings.setDefault', options)
  }
});
