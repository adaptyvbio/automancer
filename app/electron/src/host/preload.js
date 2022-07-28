const { contextBridge, ipcRenderer } = require('electron');


contextBridge.exposeInMainWorld('api', {
  getHostSettings: async () => {
    return await ipcRenderer.invoke('get-host-settings');
  },
  ready: () => {
    ipcRenderer.send('ready');
  },
  drafts: {
    load: async () => {
      return await ipcRenderer.invoke('drafts:load');
    },
    onUpdate: (callback) => {
      ipcRenderer.on('drafts:update', (_event, update) => {
        callback(message);
      });
    }
  },
  internalHost: {
    ready: async () => {
      await ipcRenderer.invoke('host:ready');
    },
    onMessage: (callback) => {
      ipcRenderer.on('host:message', (_event, message) => {
        callback(message);
      });
    },
    sendMessage: (message) => {
      ipcRenderer.send('host:message', message);
    }
  }
});
