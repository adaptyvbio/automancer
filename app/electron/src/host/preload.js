const { contextBridge, ipcRenderer } = require('electron');


contextBridge.exposeInMainWorld('common', {
  isDarwin: (process.platform === 'darwin'),
  triggerContextMenu: async (menu, position) => {
    return await ipcRenderer.invoke('contextMenu.trigger', { menu, position });
  }
});

contextBridge.exposeInMainWorld('api', {
  ready: () => {
    ipcRenderer.send('ready');
  },
  drafts: {
    create: async (source) => {
      return await ipcRenderer.invoke('drafts.create', source);
    },
    delete: async (draftId) => {
      await ipcRenderer.invoke('drafts.delete', draftId);
    },
    list: async () => {
      return await ipcRenderer.invoke('drafts.list');
    },
    load: async () => {
      return await ipcRenderer.invoke('drafts.load');
    },
    openFile: async (draftId, filePath) => await ipcRenderer.invoke('drafts.openFile', draftId, filePath),
    revealFile: async (draftId, filePath) => await ipcRenderer.invoke('drafts.revealFile', draftId, filePath),
    update: async (draftId, primitive) => {
      return await ipcRenderer.invoke('drafts:update', draftId, primitive);
    },
    watch: async (draftId, callback, onSignalAbort) => {
      let changeListener = (_event, { change, draftId: changeDraftId }) => {
        if (changeDraftId === draftId) {
          callback(change);
        }
      };

      ipcRenderer.on('drafts.change', changeListener);

      let change = await ipcRenderer.invoke('drafts.watch', draftId);
      callback(change);

      onSignalAbort(() => {
        ipcRenderer.invoke('drafts.watchStop', draftId);
        ipcRenderer.off('drafts.change', changeListener);
      });
    },
    write: async (draftId, primitive) => {
      return await ipcRenderer.invoke('drafts.write', draftId, primitive);
    }
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
