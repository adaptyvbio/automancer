export interface HostSettings {
  id: string;
  label: string;
  options: HostSettingsOptions;
}

export type HostSettingsOptions = {
  type: 'local';
  corePackagesInstalled: boolean;
  dirPath: string;
  pythonInstallationId: string | null;
  pythonInstallationPath: string; // | null; // null -> use embedded
} | {
  type: 'remote';
  address: string;
  port: number;
  auth: null;
};
