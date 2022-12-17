export type PythonInstallationId = string;

export interface PythonInstallation {
  id: PythonInstallationId;
  info: {
    architectures: string[] | null;
    version: [number, number, number];
  };
  leaf: boolean;
  path: string;
  symlink: boolean;
}

export type PythonInstallationRecord = Record<PythonInstallationId, PythonInstallation>;
