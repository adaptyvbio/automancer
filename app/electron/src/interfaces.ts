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
