import { contextBridge, ipcRenderer } from 'electron';
import type { DraftId, DraftPrimitive, MenuDef, MenuEntryId } from 'pr1';
import type { AdvertisedHostInfo, BridgeTcp, CertificateFingerprint, DraftEntry, HostSettingsId, HostSettingsRecord, LocalHostOptions, PythonInstallation, TcpHostOptions, TcpHostOptionsCandidate } from 'pr1-library';
import type { HostIdentifier, ClientProtocol, ServerProtocol } from 'pr1-shared';

import type { HostCreatorContext } from '../interfaces';


export type IPCEndpoint = {
  platform: (typeof process.platform);

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
    watch(draftId: DraftId, callback: ((change: { lastModified: number; source: string; }) => void), onSignalAbort: ((callback: (() => void)) => void)): Promise<{ lastModified: number; source: string; }>;
    watchStop(draftId: DraftId): Promise<void>;
    write(draftId: DraftId, primitive: DraftPrimitive): Promise<number | null>;
  };
};

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,

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
    create: async (source) =>
      await ipcRenderer.invoke('drafts.create', source),
    delete: async (draftId) =>
      await ipcRenderer.invoke('drafts.delete', draftId),
    list: async () =>
      await ipcRenderer.invoke('drafts.list'),
    load: async () =>
      await ipcRenderer.invoke('drafts.load'),
    openFile: async (draftId, filePath) =>
      await ipcRenderer.invoke('drafts.openFile', draftId, filePath),
    revealFile: async (draftId, filePath) =>
      await ipcRenderer.invoke('drafts.revealFile', draftId, filePath),

    // @ts-expect-error
    watch: async (draftId, callback, onSignalAbort) => {
      let changeListener = (event: any, { change, draftId: changeDraftId }: any) => {
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
    write: async (draftId, primitive) =>
      await ipcRenderer.invoke('drafts.write', draftId, primitive)
  },
} satisfies IPCEndpoint);
