import { contextBridge, ipcRenderer } from 'electron';
import type { DraftId, DraftPrimitive, MenuDef, MenuEntryId } from 'pr1';
import type { AdvertisedHostInfo, BridgeTcp, CertificateFingerprint, DraftEntry, HostSettingsId, HostSettingsRecord, LocalHostOptions, PythonInstallation, TcpHostOptions, TcpHostOptionsCandidate } from 'pr1-library';
import type { HostIdentifier, ClientProtocol, ServerProtocol } from 'pr1-shared';

import type { HostCreatorContext } from '../interfaces';


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

  host: {
    onMessage(callback: ((message: ServerProtocol.Message) => void)): void;
    ready(hostSettingsId: HostSettingsId): Promise<void>;
    sendMessage(hostSettingsId: HostSettingsId, message: ClientProtocol.Message): void;
  };

  drafts: {
    create(source: string): Promise<DraftEntry>;
    delete(draftId: DraftId): Promise<void>;
    list(): Promise<DraftEntry[]>;
    load(): Promise<DraftEntry | null>;
    openFile(draftId: DraftId, filePath: string): Promise<void>;
    revealFile(draftId: DraftId, filePath: string): Promise<void>;
    write(draftId: DraftId, primitive: DraftPrimitive): Promise<number>;
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
    addRemoteHost: async (options) =>
      await ipcRenderer.invoke('hostSettings.addRemoteHost', options),
    createLocalHost: async (options) =>
      await ipcRenderer.invoke('hostSettings.createLocalHost', options),
    displayCertificateOfRemoteHost: async (options) =>
      await ipcRenderer.invoke('hostSettings.displayCertificateOfRemoteHost', options),
    testRemoteHost: async (options) =>
      await ipcRenderer.invoke('hostSettings.testRemoteHost', options),
    delete: async (options) =>
      await ipcRenderer.invoke('hostSettings.delete', options),
    getHostCreatorContext: async () =>
      await ipcRenderer.invoke('hostSettings.getHostCreatorContext'),
    launchHost: async (options) =>
      void ipcRenderer.send('hostSettings.launchHost', options),
    list: async () =>
      await ipcRenderer.invoke('hostSettings.list'),
    queryRemoteHosts: async () =>
      await ipcRenderer.invoke('hostSettings.queryRemoteHosts'),
    revealLogsDirectory: async (options) =>
      await ipcRenderer.invoke('hostSettings.revealLogsDirectory', options),
    revealSettingsDirectory: async (options) =>
      await ipcRenderer.invoke('hostSettings.revealSettingsDirectory', options),
    selectPythonInstallation: async () =>
      await ipcRenderer.invoke('hostSettings.selectPythonInstallation'),
    setDefault: async (options) =>
      await ipcRenderer.invoke('hostSettings.setDefault', options)
  },

  host: {
    ready: async (hostSettingsId) =>
      await ipcRenderer.invoke('host.ready', hostSettingsId),
    onMessage: (callback) =>
      void ipcRenderer.on('host.message', (_event, message) => {
        callback(message);
      }),
    sendMessage: (hostSettingsId, message) =>
      void ipcRenderer.send('host.sendMessage', hostSettingsId, message)
  },

  drafts: {
    create: async (source: string) =>
      await ipcRenderer.invoke('drafts.create', source),
    delete: async (draftId: DraftId) =>
      await ipcRenderer.invoke('drafts.delete', draftId),
    list: async () =>
      await ipcRenderer.invoke('drafts.list'),
    load: async () =>
      await ipcRenderer.invoke('drafts.load'),
    openFile: async (draftId: DraftId, filePath: string) =>
      await ipcRenderer.invoke('drafts.openFile', draftId, filePath),
    revealFile: async (draftId: DraftId, filePath: string) =>
      await ipcRenderer.invoke('drafts.revealFile', draftId, filePath),
    write: async (draftId: DraftId, primitive) =>
      await ipcRenderer.invoke('drafts.write', draftId, primitive)
  },
} satisfies IPCEndpoint);
