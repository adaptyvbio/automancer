import type { FSWatcher } from 'chokidar';
import type { IpcMainInvokeEvent } from 'electron';
import type { DraftEntryId, PythonInstallationRecord } from 'pr1-library';
import type { UnionToIntersection } from 'pr1-shared';


export type IPC<T extends Record<string, ((...args: any[]) => any)>> = UnionToIntersection<{
  [S in keyof T]: T[S] extends ((...args: infer U) => Promise<infer V>)
    ? { handle(channel: S, callback: ((event: IpcMainInvokeEvent, ...args: U) => Promise<V>)): void; }
    : T[S] extends ((...args: infer U) => void)
      ? { on(channel: S, callback: ((event: IpcMainInvokeEvent, ...args: U) => void)): void; }
      : never;
}[keyof T]>;

export type IPC2d<T extends Record<string, unknown>> = UnionToIntersection<{
  [S in keyof T]: T[S] extends Record<string, ((...args: any[]) => any)>
    ? IPC<{ [U in keyof T[S] as (`${S & string}.${U & string}`)]: T[S][U]; }>
    : never;
}[keyof T]>;


export interface HostCreatorContext {
  computerName: string;
  pythonInstallations: PythonInstallationRecord;
}

export interface DraftSkeleton {
  id: DraftEntryId;
  entryPath: string;
  name: string | null;
}

export interface DocumentChange {
  instance: {
    contents: string | null; // null = contents didn't change
    lastExternalModificationDate: number;
    lastModificationDate: number;
  } | null;
  status: 'ok' | 'error' | 'missing';
}
