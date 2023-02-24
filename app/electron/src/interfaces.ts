import type { FSWatcher } from 'chokidar';
import type { IpcMainInvokeEvent } from 'electron';


declare const brand: unique symbol;

export type Brand<T, TBrand extends string> = T & {
  [brand]: TBrand;
};


export interface IPC<T extends { [key: string]: ((...args: any[]) => Promise<unknown>); }> {
  handle<S extends keyof T>(channel: S, callback: (event: IpcMainInvokeEvent, ...args: Parameters<T[S]>) => ReturnType<T[S]>): void;
}

export type IPC2d<T extends Record<string, Record<string, ((...args: any[]) => Promise<unknown>)>>> = {
  [S in keyof T]: IPC<{ [U in keyof T[S] as (`${S & string}.${U & string}`)]: T[S][U]; }>;
}[keyof T];


export type DraftEntryId = string;

export interface DraftEntry {
  id: DraftEntryId;
  lastOpened: number;
  name: string;
  path: string;
}

export interface DraftEntryState {
  lastModified: number | null;
  waiting: boolean;
  watcher: FSWatcher | null;
  writePromise: Promise<unknown>;
}

export interface PythonInstallation {
  id: string;
  leaf: boolean;
  path: string;
  info: {
    architectures: string[] | null;
    isVirtualEnv: boolean;
    supportsVirtualEnv: boolean;
    version: [number, number, number];
  };
  symlink: boolean;
}

export type PythonInstallationId = string;
export type PythonInstallationRecord = Record<PythonInstallationId, PythonInstallation>;

export interface LocalHostOptions {
  customPythonInstallation: PythonInstallation | null;
  label: string;
  pythonInstallationSettings: {
    architecture: string | null;
    id: PythonInstallationId;
    virtualEnv: boolean;
  };
}

export interface AppData {
  defaultHostSettingsId: HostSettingsId | null;
  drafts: Record<DraftEntryId, DraftEntry>;
  embeddedPythonInstallation: null;
  hostSettingsRecord: HostSettingsRecord;
  preferences: {};
  version: number;
}

export interface HostSettingsLocal {
  id: HostSettingsId;
  type: 'local';
  label: string;

  architecture: string | null;
  conf: any;
  corePackagesInstalled: boolean;
  dirPath: string;
  identifier: string;
  pythonPath: string; // | null; // null -> use embedded
}

export interface HostSettingsInternetSocket {
  id: HostSettingsId;
  type: 'socket.inet';
  label: string;

  lastIdentifier: string | null;
  hostname: string;
  port: number;
}

export type HostSettings = HostSettingsLocal | HostSettingsInternetSocket;
export type HostSettingsId = Brand<string, 'HostSettingsId'>;
export type HostSettingsRecord = Record<HostSettingsId, HostSettings>;
