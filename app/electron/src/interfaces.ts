import type { FSWatcher } from 'chokidar';
import type { IpcMainInvokeEvent } from 'electron';
import type { CertificateFingerprint } from 'pr1-library';


declare const brand: unique symbol;

export type Brand<T, TBrand extends string> = T & {
  [brand]: TBrand;
};


export type Depromisify<T> = T extends Promise<infer U> ? U : never;
export type UnionToIntersection<T> = (T extends any ? ((k: T) => void) : never) extends ((k: infer S) => void) ? S : never;


export type IPC<T extends Record<string, ((...args: any[]) => any)>> = UnionToIntersection<{
  [S in keyof T]: T[S] extends ((...args: infer U) => Promise<infer V>)
    ? { handle(channel: S, callback: ((event: IpcMainInvokeEvent, ...args: U) => Promise<V>)): void; }
    : T[S] extends ((...args: infer U) => void)
      ? { on(channel: S, callback: ((event: IpcMainInvokeEvent, ...args: U) => void)): void; }
      : never;
}[keyof T]>;

export type IPC2d<T extends Record<string, unknown>> = UnionToIntersection<{
  [S in keyof T]: T[S] extends Record<string, ((...args: any[]) => any)>
    ? IPC<{ [U in keyof T[S] as (`${S & string}.${U & string}`)]: T[S][U]; }>
    : never;
}[keyof T]>;


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

  options: RemoteHostOptions;
}

export interface RemoteHostOptions {
  fingerprint: CertificateFingerprint;
  hostname: string;
  identifier: string;
  password: string | null;
  port: number;
  secure: boolean;
  trusted: boolean;
}

export type HostSettings = HostSettingsLocal | HostSettingsInternetSocket;
export type HostSettingsId = Brand<string, 'HostSettingsId'>;
export type HostSettingsRecord = Record<HostSettingsId, HostSettings>;

export interface HostCreatorContext {
  computerName: string;
  pythonInstallations: PythonInstallationRecord;
}
