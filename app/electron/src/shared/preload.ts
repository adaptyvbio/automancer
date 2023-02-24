import { contextBridge, ipcRenderer } from 'electron';

import type { HostSettingsId, HostSettingsRecord } from '../interfaces';


contextBridge.exposeInMainWorld('common', {
  isDarwin: (process.platform === 'darwin'),
  triggerContextMenu: async (menu, position) => {
    return await ipcRenderer.invoke('contextMenu.trigger', { menu, position });
  }
});


contextBridge.exposeInMainWorld('api', {
  hostSettings: {
    connectRemoteHost: async (options) => await ipcRenderer.invoke('hostSettings.connectRemoteHost', options),
    delete: async (options) => await ipcRenderer.invoke('hostSettings.delete', options),
    query: async () => await ipcRenderer.invoke('hostSettings.query'),
    revealLogsDirectory: async (options) => await ipcRenderer.invoke('hostSettings.revealLogsDirectory', options),
    revealSettingsDirectory: async (options) => await ipcRenderer.invoke('hostSettings.revealSettingsDirectory', options),
    setDefault: async (options) => await ipcRenderer.invoke('hostSettings.setDefault', options),
  }
} satisfies MainAPI);

export type MainAPI = {
  hostSettings: {
    connectRemoteHost(options: {
      hostname: string;
      port: number;
    }): Promise<{
      ok: true;
      hostSettingsId: HostSettingsId;
      label: string;
    } | {
      ok: false;
      reason: 'refused' | 'unauthorized' | 'unknown';
    }>;
    delete(options: { hostSettingsId: HostSettingsId; }): Promise<void>;
    query(): Promise<{
      defaultHostSettingsId: HostSettingsId | null;
      hostSettingsRecord: HostSettingsRecord;
    }>;
    revealLogsDirectory(options: { hostSettingsId: HostSettingsId; }): Promise<void>;
    revealSettingsDirectory(options: { hostSettingsId: HostSettingsId; }): Promise<void>;
    setDefault(options: { hostSettingsId: HostSettingsId }): Promise<void>;
  };
};
