import { contextBridge, ipcRenderer } from 'electron';


contextBridge.exposeInMainWorld('common', {
  isDarwin: (process.platform === 'darwin'),
  triggerContextMenu: async (menu, position) => {
    return await ipcRenderer.invoke('contextMenu.trigger', { menu, position });
  }
});
