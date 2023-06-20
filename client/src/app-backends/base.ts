import type { Brand } from 'pr1-shared';

import type { Store } from '../store/base';
import type { SnapshotTarget } from '../snapshot';


export const DraftDocumentExtension = '.yml';


export type DocumentPath = string[];

export type DraftInstanceId = Brand<string, 'DraftInstanceId'>;
export type DocumentId = Brand<string, 'DocumentId'>;

export interface DraftInstance extends SnapshotTarget<DraftInstanceSnapshot> {
  id: DraftInstanceId;

  /**
   * Return a {@link DocumentInstance} object required by this instance.
   *
   * @param path A path relative to the instance's parent directory.
   * @returns A promise that resolves to a {@link DocumentInstance} object or `null` if the document does not exist.
   */
  // getDocumentSlot(path: DocumentPath): Promise<DocumentSlot | null>;

  /**
   * Return a slot for the entry document of the draft.
   *
   * @returns A {@link DocumentSlot} instance.
   */
  getEntryDocumentSlot(): DocumentSlot;

  /**
   * Remove the instance.
   *
   * @returns A promise that resolves once the instance has been removed.
   */
  remove(): Promise<void>;

  /**
   * Rename the draft.
   */
  setName(name: string): Promise<void>;
}

export interface DraftInstanceSnapshot {
  model: DraftInstance;

  id: DraftInstanceId;
  name: string | null;
}


export interface DocumentInstanceSnapshot {
  // id: DocumentId;
  contents: string;
  lastModificationDate: number | null;
  lastExternalModificationDate: number | null;
  possiblyWritable: boolean;
  writable: boolean;
}

export interface DocumentSlot extends SnapshotTarget<DocumentSlotSnapshot> {
  id: DocumentId;

  /**
   * Open the document in an external application. Optional.
   */
  open?(): Promise<void>;

  /**
   * Request permission to read or read and write to the document. Optional when permission is always granted.
   */
  request?(): Promise<void>;

  /**
   * Reveal the document in the file explorer. Optional.
   */
  reveal?(): Promise<void>;

  /**
   * Watch the slot for changes.
   *
   * @param options.signal An `AbortSignal` used to cancel stop watching the document.
   */
  watch(options: { signal: AbortSignal; }): void;

  /**
   * Write to the document.
   *
   * @param contents The contents to write to the document, encoded as UTF-8.
   * @returns A promise that resolves to an object which indicates the date on which the document was written.
   */
  write(contents: string): Promise<{ modificationDate: number; }>;
}

export type DocumentSlotStatus = 'error' | 'loading' | 'ok' | 'missing' | 'prompt' | 'unreadable' | 'unwatched';

export interface DocumentSlotSnapshot {
  model: DocumentSlot;

  id: DocumentId;
  instance: DocumentInstanceSnapshot | null;
  path: DocumentPath;
  status: DocumentSlotStatus;
}


export type DraftCandidateId = string;

export interface DraftCandidate {
  id: DraftCandidateId;
  path: DocumentPath;

  /**
   * Create a {@link DraftInstance} from this candidate.
   */
  createInstance(): Promise<DraftInstance>;
}


export interface AppBackend extends SnapshotTarget<AppBackendSnapshot> {
  /**
   * Initialize the backend. Called before any other method.
   * @returns A promise that resolves once the backend has been initialized.
   */
  initialize(): Promise<void>;

  /**
   * Create a {@link Store} object.
   *
   * @param name The name of the store.
   * @param options.type The type of the store.
   */
  createStore(name: string, options: { type: 'persistent' | 'session'; }): Store;

  /**
   * Trigger a file or directory open dialog and return an array of corresponding {@link DraftCandidate} objects.

   * Returns an empty array if the operation is aborted.

   * @param options.directory Whether to open a directory dialog rather than a file dialog. Used in browser frontends only.
   */
  queryDraftCandidates(options: { directory: boolean; }): Promise<DraftCandidate[]>;
}

export interface AppBackendSnapshot {
  // documents: Record<DraftDocumentId, DocumentInstanceSnapshot>;
  drafts: Record<DraftInstanceId, DraftInstanceSnapshot>;
}

export interface AppBackendClass {
  new(): AppBackend;
}
