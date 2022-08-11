import type { HostBackendOptions, HostSettings, HostSettingsData, HostSettingsRecord } from '../host';
import type { DraftId, DraftPrimitive } from '../draft';
import { BaseBackend } from '../backends/base';


export interface DraftItem {
  id: DraftId;
  name: string | null;
  kind: 'own' | 'ref';
  lastModified: number | null;
  getFiles(): Promise<Record<string, Blob> | null>;
  getMainFile(): Promise<Blob | null>;
  mainFilePath: string;
  locationInfo: {
    type: 'directory' | 'file';
    name: string;
  } | null;
}

export type DraftsUpdateRecord = Record<DraftId, DraftItem | undefined>;
export type DraftsUpdateEvent = { update: DraftsUpdateRecord; options: { skipCompilation: boolean; } };
export type DraftsUpdateListener = (event: DraftsUpdateEvent) => void;


export interface AppBackend {
  initialize(): Promise<void>;

  deleteHostSettings(settingsId: string): Promise<void>;
  getHostSettingsData(): Promise<HostSettingsData>;
  setDefaultHostSettings(settingsId: string | null): Promise<void>;
  setHostSettings(settings: HostSettings): Promise<void>;

  createDraft(source: string): Promise<DraftId | null>;
  deleteDraft(draftId: DraftId): Promise<void>;
  loadDraft(): Promise<DraftId | null>;
  setDraft(draftId: DraftId, primitive: DraftPrimitive, options?: { skipCompilation?: unknown; }): Promise<void>;
  onDraftsUpdate(listener: DraftsUpdateListener, options?: { signal?: AbortSignal; }): void;

  notify(message: string): Promise<void>;

  createBackend?(options: HostBackendOptions): Promise<BaseBackend | null>;
}

export interface AppBackendClass {
  new(): AppBackend;
}
