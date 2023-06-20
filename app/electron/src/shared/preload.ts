import { contextBridge, ipcRenderer } from 'electron';
import type { MenuDef, MenuEntryPathLike } from 'pr1';
import type { AdvertisedHostInfo, BridgeTcp, CertificateFingerprint, DraftEntryId, HostSettingsId, HostSettingsRecord, LocalHostOptions, PythonInstallation, TcpHostOptions, TcpHostOptionsCandidate } from 'pr1-library';
import type { ClientProtocol, HostIdentifier, ServerProtocol } from 'pr1-shared';

import type { DocumentChange, DraftSkeleton, HostCreatorContext } from '../interfaces';


export type IPCEndpoint = {
  platform: (typeof process.platform);

  main: {
    ready(): void;
    triggerContextMenu(menu: MenuDef, position: { x: number; y: number; }): Promise<MenuEntryPathLike | null>;
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
    // create(source: string): Promise<DraftEntry>;
    delete(draftEntryId: DraftEntryId): Promise<void>;
    list(): Promise<DraftSkeleton[]>;
    query(): Promise<DraftSkeleton | null>;
    setName(draftEntryId: DraftEntryId, name: string): Promise<void>;
    watch(filePath: string, callback: ((change: DocumentChange) => void), onSignalAbort: (callback: (() => void)) => void): void;
    watchStop(filePath: string): Promise<void>;
    write(filePath: string, contents: string): Promise<void>;
    // load(): Promise<DraftEntry | null>;
    // openFile(draftId: DraftId, filePath: string): Promise<void>;
    // revealFile(draftId: DraftId, filePath: string): Promise<void>;
  };

  store: {
    read(storeName: string, key: string): Promise<unknown | undefined>;
    readAll(storeName: string): Promise<(readonly [string, unknown])[]>;
    write(storeName: string, key: string, value: unknown): Promise<void>;
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
    query: async () =>
      await ipcRenderer.invoke('drafts.query'),
    write: async (filePath, contents) =>
      await ipcRenderer.invoke('drafts.write', filePath, contents),

    // create: async (source) =>
    //   await ipcRenderer.invoke('drafts.create', source),
    delete: async (draftEntryId) =>
      await ipcRenderer.invoke('drafts.delete', draftEntryId),
    list: async () =>
      await ipcRenderer.invoke('drafts.list'),
    setName: async (draftEntryId, name) =>
      await ipcRenderer.invoke('drafts.setName', draftEntryId, name),
    // load: async () =>
    //   await ipcRenderer.invoke('drafts.load'),
    // openFile: async (draftId, filePath) =>
    //   await ipcRenderer.invoke('drafts.openFile', draftId, filePath),
    // revealFile: async (draftId, filePath) =>
    //   await ipcRenderer.invoke('drafts.revealFile', draftId, filePath),

    watch: async (filePath, callback, onSignalAbort) => {
      let changeListener = (event: any, changeFilePath: string, change: DocumentChange) => {
        if (changeFilePath === filePath) {
          callback(change);
        }
      };

      ipcRenderer.on('drafts.change', changeListener);

      let change = await ipcRenderer.invoke('drafts.watch', filePath);
      callback(change);

      onSignalAbort(() => {
        ipcRenderer.invoke('drafts.watchStop', filePath);
        ipcRenderer.off('drafts.change', changeListener);
      });
    },
    watchStop: (null as never)
  },

  store: {
    read: async (storeName, key) =>
      await ipcRenderer.invoke('store.read', storeName, key),
    readAll: async (storeName) =>
      await ipcRenderer.invoke('store.readAll', storeName),
    write: async (storeName, key, value) =>
      await ipcRenderer.invoke('store.write', storeName, key, value)
  }
} satisfies IPCEndpoint);
