import type { FSWatcher } from 'chokidar';
import type { HostSettings, HostSettingsId } from 'pr1';


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
  defaultHostSettingsId: string | null;
  drafts: Record<DraftEntryId, DraftEntry>;
  embeddedPythonInstallation: null;
  hostSettings: Record<HostSettingsId, HostSettings>;
  preferences: {};
  version: number;
}
