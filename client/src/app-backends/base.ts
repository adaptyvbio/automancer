import type { HostBackendOptions, HostSettings, HostSettingsData, HostSettingsRecord } from '../host';
import type { DraftId, DraftPrimitive } from '../draft';
import { BaseBackend } from '../backends/base';


export interface DraftItem {
  id: DraftId;
  name: string | null;
  kind: 'own' | 'ref';
  lastModified: number | null;
  locationInfo: {
    type: 'directory' | 'file';
    name: string;
  } | null;
  mainFilePath: string;
  revision: number;
  volumeInfo: {
    type: 'disk' | 'network';
    name: string;
  } | null;

  readable: boolean;
  readonly: boolean;
  writable: boolean;

  getFiles(): Promise<Record<string, Blob> | null>;
  request(): Promise<void>;
  watch(handler: () => void, options: { signal: AbortSignal; }): void;
  write(primitive: DraftPrimitive): Promise<void>;
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
  listDrafts(): Promise<DraftItem[]>;
  loadDraft(options: { directory: boolean; }): Promise<DraftItem | null>;
  openDraftFile?(draftId: DraftId, filePath: string): Promise<void>;
  revealDraft?(draftId: DraftId): Promise<void>;
  // setDraft(draftId: DraftId, primitive: DraftPrimitive): Promise<void>;
  requestDraft?(draftId: DraftId): Promise<void>;

  notify(message: string): Promise<void>;

  createBackend?(options: HostBackendOptions): Promise<BaseBackend | null>;
}

export interface AppBackendClass {
  new(): AppBackend;
}
