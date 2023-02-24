import { contextBridge, ipcRenderer } from 'electron';

import { HostSettingsId } from '../interfaces';
import '../shared/preload';


const api = {
  launchHost: (options) => void ipcRenderer.send('launchHost', options),
  ready: () => void ipcRenderer.send('ready'),

  hostSettings: {
    create: async (options) => await ipcRenderer.invoke('hostSettings.create', options),
    createLocalHost: async (options) => await ipcRenderer.invoke('hostSettings.createLocalHost', options),
    delete: async (options) => await ipcRenderer.invoke('hostSettings.delete', options),
    query: async () => await ipcRenderer.invoke('hostSettings.query'),
    queryRemoteHosts: async () => await ipcRenderer.invoke('hostSettings.queryRemoteHosts'),
    getCreatorContext: async () => await ipcRenderer.invoke('hostSettings.getCreatorContext'),
    revealLogsDirectory: async (options) => await ipcRenderer.invoke('hostSettings.revealLogsDirectory', options),
    revealSettingsDirectory: async (options) => await ipcRenderer.invoke('hostSettings.revealSettingsDirectory', options),
    selectPythonInstallation: async () => await ipcRenderer.invoke('hostSettings.selectPythonInstallation'),
    setDefault: async (options) => await ipcRenderer.invoke('hostSettings.setDefault', options),
  }
};

contextBridge.exposeInMainWorld('api', api);
