import { contextBridge, ipcRenderer } from 'electron';
import type { MenuDef, MenuEntryId, MenuEntryPath } from 'pr1';
import { AdvertisedHostInfo, BridgeTcp, CertificateFingerprint, HostIdentifier, TcpHostOptions, TcpHostOptionsCandidate } from 'pr1-library';

import type { HostCreatorContext, HostSettingsId, HostSettingsRecord, LocalHostOptions, PythonInstallation } from '../interfaces';


export type IPCEndpoint = {
  isDarwin: boolean;

  main: {
    ready(): void;
    triggerContextMenu(menu: MenuDef, position: { x: number; y: number; }): Promise<MenuEntryId[] | null>;
  };

  hostSettings: {
    addRemoteHost(options: {
      label: string;
      options: TcpHostOptions;
    }): Promise<{
      hostSettingsId: HostSettingsId;
    }>;
    createLocalHost(options: LocalHostOptions): Promise<{
      ok: true;
      hostSettingsId: HostSettingsId;
    } | {
      ok: false;
      reason: 'other';
      message: string;
    }>;
    displayCertificateOfRemoteHost(options: {
      fingerprint: CertificateFingerprint;
      hostname: string;
      port: number;
    }): Promise<void>;
    testRemoteHost(options: TcpHostOptionsCandidate): Promise<{
      ok: true;
      fingerprint: CertificateFingerprint;
      identifier: HostIdentifier;
      name: string;
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
      reason: 'missing_password';
    } | {
      ok: false;
      reason: 'refused';
    } | {
      ok: false;
      reason: 'unauthorized';
      message: string;
    } | {
      ok: false;
      reason: 'untrusted_server';
      fingerprint: CertificateFingerprint;
    }>;
    delete(options: { hostSettingsId: HostSettingsId; }): Promise<void>;
    getHostCreatorContext(): Promise<HostCreatorContext>;
    queryRemoteHosts(): Promise<(AdvertisedHostInfo & { bridges: BridgeTcp[]; })[]>;
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
      return await ipcRenderer.invoke('main.triggerContextMenu', menu, position);
    }
  },

  hostSettings: {
    addRemoteHost: async (options) => await ipcRenderer.invoke('hostSettings.addRemoteHost', options),
    createLocalHost: async (options) => await ipcRenderer.invoke('hostSettings.createLocalHost', options),
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
