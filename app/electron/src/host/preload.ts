import { contextBridge, ipcRenderer } from 'electron';

import type { DraftId, HostSettingsId } from 'pr1';

import type { DraftEntry } from '../interfaces';


contextBridge.exposeInMainWorld('common', {
  isDarwin: (process.platform === 'darwin'),
  triggerContextMenu: async (menu, position) => {
    return await ipcRenderer.invoke('contextMenu.trigger', { menu, position });
  }
});

const api = {
  ready: () => {
    ipcRenderer.send('ready');
  },
  drafts: {
    create: async (source: string) => {
      return await ipcRenderer.invoke('drafts.create', source);
    },
    delete: async (draftId: DraftId) => {
      await ipcRenderer.invoke('drafts.delete', draftId);
    },
    list: async () => {
      return (await ipcRenderer.invoke('drafts.list')) as DraftEntry[];
    },
    load: async () => {
      return await ipcRenderer.invoke('drafts.load');
    },
    openFile: async (draftId: DraftId, filePath: string) => await ipcRenderer.invoke('drafts.openFile', draftId, filePath),
    revealFile: async (draftId: DraftId, filePath: string) => await ipcRenderer.invoke('drafts.revealFile', draftId, filePath),
    update: async (draftId: DraftId, primitive) => {
      return await ipcRenderer.invoke('drafts:update', draftId, primitive);
    },
    watch: async (draftId: DraftId, callback: (change: { lastModified: number; source: string; }) => void, onSignalAbort) => {
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
    write: async (draftId: DraftId, primitive) => {
      return await ipcRenderer.invoke('drafts.write', draftId, primitive);
    }
  },
  localHost: {
    ready: async (hostSettingsId: HostSettingsId) => {
      await ipcRenderer.invoke('localHost.ready', hostSettingsId);
    },
    onMessage: (callback) => {
      ipcRenderer.on('localHost.message', (_event, message) => {
        callback(message);
      });
    },
    sendMessage: (hostSettingsId: HostSettingsId, message) => {
      ipcRenderer.send('localHost.message', hostSettingsId, message);
    }
  },
  hostSettings: {
    query: async () => await ipcRenderer.invoke('hostSettings.query')
  }
};

contextBridge.exposeInMainWorld('api', api);


declare global {
  interface Window {
    readonly api: any;
    readonly common: any;
  }
}
