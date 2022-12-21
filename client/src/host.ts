import type { BaseBackend } from './backends/base';
import type { HostId, HostState } from './backends/common';
import { AnonymousUnit, UnitNamespace } from './interfaces/unit';


export interface Host {
  backend: BaseBackend;
  id: HostId;
  state: HostState;
  units: Record<UnitNamespace, AnonymousUnit>;
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

  options: HostBackendOptions;
}

export type HostSettingsRecord = Record<string, HostSettings>;

export interface HostSettingsData {
  defaultHostSettingsId: HostId | null;
  hosts: HostSettingsRecord;
}

export function formatHostSettings(hostSettings: HostSettings): string | null {
  switch (hostSettings.options.type) {
    case 'local': return 'Local';
    case 'remote': return `${hostSettings.options.address}:${hostSettings.options.port}`;
    default: return null;
  }
}
