export type PythonInstallationId = string;

export interface PythonInstallation {
  id: PythonInstallationId;
  info: {
    architectures: string[] | null;
    isVirtualEnv: boolean;
    supportsVirtualEnv: boolean;
    version: [number, number, number];
  };
  leaf: boolean;
  path: string;
  symlink: boolean;
}

export type PythonInstallationRecord = Record<PythonInstallationId, PythonInstallation>;


export interface DevelopmentSetupOptions {
  customPythonInstallation: PythonInstallation | null;
  label: string;
  pythonInstallationSettings: {
    architecture: string | null;
    id: PythonInstallationId;
    virtualEnv: boolean;
  };
}
