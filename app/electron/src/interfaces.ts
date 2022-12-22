export interface HostSettings {
  id: string;
  label: string;
  options: HostSettingsOptions;
}

export type HostSettingsOptions = {
  type: 'local';
  architecture: string | null;
  corePackagesInstalled: boolean;
  dirPath: string;
  id: string;
  pythonPath: string; // | null; // null -> use embedded
} | {
  type: 'remote';
  address: string;
  port: number;
  auth: null;
};

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
