export interface HostInfo {
  // id: number;
  imageUrl: string | null;
  subtitle: string;
  title: string;
}


export type HostSettingsId = string;

export interface HostSettings {
  id: HostSettingsId;
  label: string;
  options: HostSettingsOptions;
}

export interface HostSettingsOptionsLocal {
  type: 'local';
  architecture: string | null;
  conf: object;
  corePackagesInstalled: boolean;
  dirPath: string;
  id: string;
  pythonPath: string; // | null; // null -> use embedded
}

export interface HostSettingsOptionsRemote {
  type: 'remote';
  address: string;
  port: number;
  auth: null;
}

export type HostSettingsOptions = HostSettingsOptionsLocal | HostSettingsOptionsRemote;


export type HostSettingsCollection = Record<HostSettingsId, HostSettings>;

export interface HostSettingsData {
  defaultHostSettingsId: HostSettingsId | null;
  hosts: HostSettingsCollection;
}
