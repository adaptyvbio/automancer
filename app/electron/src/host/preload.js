const { contextBridge, ipcRenderer } = require('electron');


contextBridge.exposeInMainWorld('api', {
  getHostSettings: async () => {
    return await ipcRenderer.invoke('get-host-settings');
  },
  ready: () => {
    ipcRenderer.send('ready');
  },
  drafts: {
    create: async (source) => {
      return await ipcRenderer.invoke('drafts:create', source);
    },
    delete: async (draftId) => {
      await ipcRenderer.invoke('drafts:delete', draftId);
    },
    getSource: async (draftId) => {
      return new Blob([await ipcRenderer.invoke('drafts:get-source', draftId)], { type: 'text/xml' });
    },
    list: async () => {
      return await ipcRenderer.invoke('drafts:list');
    },
    load: async () => {
      return await ipcRenderer.invoke('drafts:load');
    },
    update: async (draftId, primitive) => {
      return await ipcRenderer.invoke('drafts:update', draftId, primitive);
    }
    // onUpdate: (callback) => {
    //   ipcRenderer.on('drafts:update', (_event, update) => {
    //     callback(message);
    //   });
    // }
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
