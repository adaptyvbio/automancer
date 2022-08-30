const { contextBridge, ipcRenderer } = require('electron');


contextBridge.exposeInMainWorld('api', {
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
    ready: async (hostSettingsId) => {
      await ipcRenderer.invoke('internalHost.ready', hostSettingsId);
    },
    onMessage: (callback) => {
      ipcRenderer.on('internalHost.message', (_event, message) => {
        callback(message);
      });
    },
    sendMessage: (hostSettingsId, message) => {
      ipcRenderer.send('internalHost.message', hostSettingsId, message);
    }
  },
  hostSettings: {
    query: async () => await ipcRenderer.invoke('hostSettings.query')
  }
});
