import { HostSettings, HostSettingsRecord } from '../application';
import { DraftId, DraftPrimitive } from '../draft';


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

export interface AppBackendOptions {
  onDraftsUpdate(update: DraftsUpdateRecord, options?: { skipCompilation?: unknown; }): void;
}


export interface AppBackend {
  initialize?(): Promise<void>;

  deleteHostSettings(settingsId: string): Promise<void>;
  getHostSettings(): Promise<HostSettingsRecord>;
  setHostSettings(settings: HostSettings): Promise<void>;

  createDraft(source: string): Promise<DraftId | null>;
  deleteDraft(draftId: DraftId): Promise<void>;
  loadDraft(): Promise<DraftId | null>;
  setDraft(draftId: DraftId, primitive: DraftPrimitive, options?: { skipCompilation?: unknown; }): Promise<void>;

  notify(message: string): Promise<void>;
}

export interface AppBackendClass {
  new(options: AppBackendOptions): AppBackend;
}
