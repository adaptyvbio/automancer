import { Brand, HostIdentifier } from 'pr1-shared';


export type DraftEntryId = string;

export interface DraftEntry {
  id: DraftEntryId;
  lastOpened: number;
  name: string;
  path: string;
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
  options: {
    architecture: string | null;
    conf: ServerConfiguration;
    corePackagesInstalled: boolean;
    dirPath: string;
    identifier: HostIdentifier;
    pythonPath: string; // | null; // null -> use embedded
    socketPath: string;
  };
}

export interface HostSettingsTcp {
  id: HostSettingsId;
  type: 'tcp';
  label: string;
  options: TcpHostOptions;
}

export type HostSettings = HostSettingsLocal | HostSettingsTcp;
export type HostSettingsId = Brand<string, 'HostSettingsId'>;
export type HostSettingsRecord = Record<HostSettingsId, HostSettings>;


export interface ServerConfiguration {
  advertisement: {
    description: string;
  } | null;
  auth: null;
  bridges: ({
    type: 'socket';
    options: {
      type: 'inet';
      hostname: string;
      port: number;
    } | {
      type: 'unix';
      path: string;
    };
  } | {
    type: 'stdio';
    options: {};
  } | {
    type: 'websocket';
    options: {
      hostname: string;
      port: number;
      secure: boolean;
      singleClient: boolean;
      staticAuthenticateClients: boolean;
      staticPort: boolean;
    };
  })[];
  identifier: HostIdentifier;
  version: number;
}


export type TcpHostOptions = {
  hostname: string;
  identifier: HostIdentifier;
  password: string | null;
  port: number;
} & ({
  secure: false;
} | {
  fingerprint: CertificateFingerprint;
  secure: true;
  trusted: boolean;
});

export type TcpHostOptionsCandidate = {
  hostname: string;
  identifier: HostIdentifier | null;
  password: string | null;
  port: number;
} & ({
  secure: false;
} | {
  fingerprint: CertificateFingerprint | null;
  secure: true;
  trusted: boolean;
});


export type CertificateFingerprint = Brand<string, 'CertificateFingerprint'>;
