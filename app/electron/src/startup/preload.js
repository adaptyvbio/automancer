import { contextBridge, ipcRenderer } from 'electron';
import '../shared/preload';


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
    revealLogsDirectory: async (options) => await ipcRenderer.invoke('hostSettings.revealLogsDirectory', options),
    revealSettingsDirectory: async (options) => await ipcRenderer.invoke('hostSettings.revealSettingsDirectory', options),
    setDefault: async (options) => await ipcRenderer.invoke('hostSettings.setDefault', options)
  }
});
