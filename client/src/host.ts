import type { BaseBackend } from './backends/base';
import type { HostId, HostState } from './backends/common';
import { Unit, UnitName } from './units';


export interface Host {
  backend: BaseBackend;
  id: HostId;
  state: HostState;
  units: Record<UnitName, Unit<unknown, unknown>>;
}

export interface HostRemoteBackendOptions {
  type: 'remote';
  auth: HostBackendAuthOptions | null;
  address: string;
  port: number;
  secure: boolean;
}

export type HostBackendOptions = HostRemoteBackendOptions | {
  type: 'internal';
  Backend: { new(): BaseBackend; };
} | {
  type: 'local';
  id: string;
  storage: LocalBackendStorage;
} | {
  type: 'inactive';
};

export type LocalBackendStorage = {
  type: 'filesystem';
  handle: FileSystemDirectoryHandle;
} | {
  type: 'persistent';
} | {
  type: 'memory';
};

export type HostBackendAuthOptions = {
  methodIndex: number;

  type: 'password';
  password: string;
};


export interface HostSettings {
  id: string;
  builtin: boolean;
  hostId: HostId | null;
  label: string | null;
  locked: boolean;

  backendOptions: HostBackendOptions;
}

export type HostSettingsRecord = Record<string, HostSettings>;

export function formatHostSettings(hostSettings: HostSettings): string | null {
  switch (hostSettings.backendOptions.type) {
    case 'internal': return 'This computer';
    case 'remote': return `${hostSettings.backendOptions.address}:${hostSettings.backendOptions.port}`;
    default: return null;
  }
}
