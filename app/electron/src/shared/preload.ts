import { contextBridge, ipcRenderer } from 'electron';
import type { MenuDef, MenuEntryId, MenuEntryPath } from 'pr1';
import { AdvertisedHostInfo, CertificateFingerprint } from 'pr1-library';

import type { HostCreatorContext, HostSettingsId, HostSettingsRecord, PythonInstallation } from '../interfaces';


// export type IPCEndpointCommon = {
// };

// contextBridge.exposeInMainWorld('common', {
// } satisfies IPCEndpointCommon);


export type IPCEndpoint = {
  isDarwin: boolean;

  main: {
    ready(): void;
    triggerContextMenu(menu: MenuDef, position: { x: number; y: number; }): Promise<MenuEntryId[] | null>;
  };

  // contextMenu: {
  //   trigger(menu: MenuDef, position: { x: number; y: number; }): Promise<MenuEntryId[] | null>;
  // };

  hostSettings: {
    addRemoteHost(options: {
      fingerprint: CertificateFingerprint;
      hostname: string;
      password: string | null;
      port: number;
      secure: boolean;
      trusted: boolean;
    }): Promise<{
      ok: true;
      hostSettingsId: HostSettingsId;
    }>;
    displayCertificateOfRemoteHost(options: {
      fingerprint: CertificateFingerprint;
      hostname: string;
      port: number;
    }): Promise<void>;
    testRemoteHost(options: {
      fingerprint: CertificateFingerprint | null;
      hostname: string;
      password: string | null;
      port: number;
      secure: boolean;
      trusted: boolean;
    }): Promise<{
      ok: true;
      identifier: string;
      label: string;
    } | {
      ok: false;
      reason: 'fingerprint_mismatch';
    } | {
      ok: false;
      reason: 'invalid_parameters';
    } | {
      ok: false;
      reason: 'invalid_protocol';
    } | {
      ok: false;
      reason: 'refused';
    } | {
      ok: false;
      reason: 'untrusted_server';
      fingerprint: CertificateFingerprint;
      serialNumber: string;
    }>;
    delete(options: { hostSettingsId: HostSettingsId; }): Promise<void>;
    getHostCreatorContext(): Promise<HostCreatorContext>;
    queryRemoteHosts(): Promise<AdvertisedHostInfo[]>;
    launchHost(options: { hostSettingsId: HostSettingsId; }): void;
    list(): Promise<{
      defaultHostSettingsId: HostSettingsId | null;
      hostSettingsRecord: HostSettingsRecord;
    }>;
    revealLogsDirectory(options: { hostSettingsId: HostSettingsId; }): Promise<void>;
    revealSettingsDirectory(options: { hostSettingsId: HostSettingsId; }): Promise<void>;
    selectPythonInstallation(): Promise<PythonInstallation | null>;
    setDefault(options: { hostSettingsId: HostSettingsId }): Promise<void>;
  };
};

contextBridge.exposeInMainWorld('api', {
  isDarwin: (process.platform === 'darwin'),

  main: {
    ready: () => ipcRenderer.send('main.ready'),
    triggerContextMenu: async (menu, position) => {
      return await ipcRenderer.invoke('contextMenu.trigger', menu, position);
    }
  },

  hostSettings: {
    addRemoteHost: async (options) => await ipcRenderer.invoke('hostSettings.addRemoteHost', options),
    displayCertificateOfRemoteHost: async (options) => await ipcRenderer.invoke('hostSettings.displayCertificateOfRemoteHost', options),
    testRemoteHost: async (options) => await ipcRenderer.invoke('hostSettings.testRemoteHost', options),
    delete: async (options) => await ipcRenderer.invoke('hostSettings.delete', options),
    getHostCreatorContext: async () => await ipcRenderer.invoke('hostSettings.getHostCreatorContext'),
    launchHost: async (options) => ipcRenderer.invoke('hostSettings.launchHost', options),
    list: async () => await ipcRenderer.invoke('hostSettings.list'),
    queryRemoteHosts: async () => await ipcRenderer.invoke('hostSettings.queryRemoteHosts'),
    revealLogsDirectory: async (options) => await ipcRenderer.invoke('hostSettings.revealLogsDirectory', options),
    revealSettingsDirectory: async (options) => await ipcRenderer.invoke('hostSettings.revealSettingsDirectory', options),
    selectPythonInstallation: async () => await ipcRenderer.invoke('hostSettings.selectPythonInstallation'),
    setDefault: async (options) => await ipcRenderer.invoke('hostSettings.setDefault', options),
  },
} satisfies IPCEndpoint);
