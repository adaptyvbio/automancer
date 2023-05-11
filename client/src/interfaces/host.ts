import type { Brand } from 'pr1-shared';


export interface HostInfo {
  id: HostInfoId;
  description: string;
  imageUrl: string | null;
  label: string;
  local: boolean;
}

export type HostInfoId = Brand<string, 'HostInfoId'>;


/* export type HostSettingsId = string;

export interface HostSettings {
  id: HostSettingsId;
  label: string;
  options: HostSettingsOptions;
}

export interface HostSettingsOptionsLocal {
  type: 'local';
  architecture: string | null;
  conf: any;
  dirPath: string;
  identifier: string;
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
 */
