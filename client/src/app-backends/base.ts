import type { DraftId, DraftPrimitive } from '../draft';
import { BaseBackend } from '../backends/base';
import { HostSettings, HostSettingsData, HostSettingsId } from '../interfaces/host';
import { SnapshotTarget } from '../snapshot';


export const DraftDocumentExtension = '.yml';


export type DraftDocumentPath = string[];

export type DraftInstanceId = string;
export type DraftDocumentId = string;

export interface DraftInstance<T extends DraftDocument = DraftDocument> extends SnapshotTarget<DraftInstanceSnapshot> {
  entryDocument: T;

  /**
   * Returns a {@link DraftDocument} object required by this instance.
   * @param path A path relative to the instance's parent directory.
   * @returns A promise that resolves to a {@link DraftDocument} object or `null` if the document does not exist.
   */
  getDocument(path: DraftDocumentPath): Promise<T | null>;

  /**
   * Removes the instance.
   * @returns A promise that resolves once the instance has been removed.
   */
  remove(): Promise<void>;

  /**
   * Watches all documents of the instance for changes. The callback is not called immediately after calling `watch()` nor after writing to a document with {@link DraftDocument.write}.
   * @param callback A function called every time a change occurs.
   * @param options.signal A signal used to stop watching.
   * @returns A promise that resolves once the watch operation has started.
   */
  watch(callback: (documentIds: Set<DraftDocumentId>) => void, options: { signal: AbortSignal; }): Promise<void>;
};

export interface DraftInstanceSnapshot {
  model: DraftInstance;

  id: DraftInstanceId;
  entryDocumentId: DraftDocumentId;
  name: string | null;
}


export interface DraftDocument extends SnapshotTarget<DraftDocumentSnapshot> {
  /**
   * Opens the document in an external application. Optional.
   */
  open?(): Promise<void>;

  /**
   * Reveals the document in the file explorer. Optional.
   */
  reveal?(): Promise<void>;

  /**
   * Writes to the document.
   * @param contents The contents to write to the document, encoded as UTF-8.
   * @returns A promise that resolves to an object which indicates the date on which the document was written.
   */
  write(contents: string): Promise<{ lastModified: number; }>;
};

export interface DraftDocumentSnapshot {
  model: DraftDocument;

  id: DraftDocumentId;
  // source: string | null;
  lastModified: number | null;
  path: DraftDocumentPath;
  readonly: boolean;
}


export type DraftCandidateId = string;

export interface DraftCandidate {
  id: DraftCandidateId;
  path: DraftDocumentPath;

  /**
   * Creates a {@link DraftInstance} from this candidate.
   */
  createInstance(): Promise<DraftInstance>;
}


export interface AppBackend extends SnapshotTarget<AppBackendSnapshot> {
  /**
   * Initializes the backend. Called before any other method.
   * @returns A promise that resolves once the backend has been initialized.
   */
  initialize(): Promise<void>;

  deleteHostSettings(hostSettingsId: HostSettingsId): Promise<void>;
  getHostSettingsData(): Promise<HostSettingsData>;
  setDefaultHostSettings(hostSettingsId: HostSettingsId | null): Promise<void>;
  setHostSettings(hostSettings: HostSettings): Promise<void>;

  // createDraft(options: { directory: boolean; source: string; }): Promise<DraftItem | null>;
  // deleteDraft(draftId: DraftId): Promise<void>;
  // listDrafts(): Promise<DraftItem[]>;
  // loadDraft(options: { directory: boolean; }): Promise<DraftItem | null>;
  // requestDraft?(draftId: DraftId): Promise<void>;

  // notify(message: string): Promise<void>;

  /**
   * Triggers a file or directory open dialog and returns an array of corresponding {@link DraftCandidate} objects. Returns an empty array if the operations is aborted.
   * @param options.directory Whether to open a directory dialog rather than a file dialog. Used in browser frontends only.
   */
  queryDraftCandidates(options: { directory: boolean; }): Promise<DraftCandidate[]>;

  /**
   * Lists all known {@link DraftInstance} objects.
   * @returns A promise that resolves to an array of {@link DraftInstance} objects.
   */
  // listDraftInstances(): Promise<DraftInstance[]>;

  // listDrafts(): Promise<DraftInstance[]>;
  // moveDocument(documentId: DraftDocumentId, newPath: string): Promise<void>;
}

export interface AppBackendSnapshot {
  documents: Record<DraftDocumentId, DraftDocumentSnapshot>;
  drafts: Record<DraftInstanceId, DraftInstanceSnapshot>;
}

export interface AppBackendClass {
  new(): AppBackend;
}
