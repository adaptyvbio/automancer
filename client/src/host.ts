import type { BaseBackend } from './backends/base';
import type { HostId, HostState } from './backends/common';
import { Unit, UnitNamespace } from './interfaces/unit';


export interface Host {
  backend: BaseBackend;
  id: HostId;
  state: HostState;
  units: Record<UnitNamespace, Unit>;
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
  model: string;
} | {
  type: 'local';
  id: string;
  storage: LocalBackendStorage;
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
  label: string | null;
  locked: boolean;

  backendOptions: HostBackendOptions;
}

export type HostSettingsRecord = Record<string, HostSettings>;

export interface HostSettingsData {
  defaultHostSettingsId: HostId | null;
  hosts: HostSettingsRecord;
}

export function formatHostSettings(hostSettings: HostSettings): string | null {
  switch (hostSettings.backendOptions.type) {
    case 'internal': return {
      'alpha': 'Embedded',
      'beta': 'Local Python'
    }[hostSettings.backendOptions.model] ?? null;
    case 'remote': return `${hostSettings.backendOptions.address}:${hostSettings.backendOptions.port}`;
    default: return null;
  }
}
