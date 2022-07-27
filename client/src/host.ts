import type { BaseBackend } from './backends/base';
import type { HostId, HostState } from './backends/common';


export interface Host {
  backend: BaseBackend;
  id: HostId;
  state: HostState;
}

export type HostBackendOptions = {
  type: 'remote';
  auth: HostBackendAuthOptions | null;
  address: string;
  port: number;
  secure: boolean;
} | {
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
  locked: boolean;
  label: string | null;

  backendOptions: HostBackendOptions;
}

export type HostSettingsRecord = Record<string, HostSettings>;

export function formatHostSettings(hostSettings: HostSettings): string | null {
  switch (hostSettings.backendOptions.type) {
    case 'remote': return `${hostSettings.backendOptions.address}:${hostSettings.backendOptions.port}`;
    default: return null;
  }
}
