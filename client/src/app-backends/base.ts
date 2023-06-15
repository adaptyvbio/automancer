import type { Brand } from 'pr1-shared';

import type { Store } from '../store/base';
import type { SnapshotTarget } from '../snapshot';


export const DraftDocumentExtension = '.yml';


export type DraftDocumentPath = string[];

export type DraftInstanceId = Brand<string, 'DraftInstanceId'>;
export type DraftDocumentId = Brand<string, 'DraftDocumentId'>;

export interface DraftInstance<T extends DraftDocument = DraftDocument> extends SnapshotTarget<DraftInstanceSnapshot> {
  id: DraftInstanceId;
  entryDocument: T;

  /**
   * Return a {@link DraftDocument} object required by this instance.
   *
   * @param path A path relative to the instance's parent directory.
   * @returns A promise that resolves to a {@link DraftDocument} object or `null` if the document does not exist.
   */
  getDocument(path: DraftDocumentPath): Promise<T | null>;

  /**
   * Remove the instance.
   *
   * @returns A promise that resolves once the instance has been removed.
   */
  remove(): Promise<void>;

  /**
   * Watch all documents of the instance for changes.

   * The callback is not called immediately after calling `watch()` nor after writing to a document with {@link DraftDocument.write}.
   *
   * @param callback A function called every time a change occurs.
   * @param options.signal A signal used to stop watching.
   * @returns A promise that resolves once the watch operation has started.
   */
  // watch(callback: (documentIds: Set<DraftDocumentId>) => void, options: { signal: AbortSignal; }): Promise<void>;
}

export interface DraftInstanceSnapshot {
  model: DraftInstance;

  id: DraftInstanceId;
  entryDocumentId: DraftDocumentId;
  name: string | null;
}


export interface DraftDocument extends SnapshotTarget<DraftDocumentSnapshot> {
  id: DraftDocumentId;

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
   * Writes to the document.
   * @param contents The contents to write to the document, encoded as UTF-8.
   * @returns A promise that resolves to an object which indicates the date on which the document was written.
   */
  write(contents: string): Promise<{ lastModified: number; }>;
};

export interface DraftDocumentSnapshot {
  model: DraftDocument;

  id: DraftDocumentId;
  deleted: boolean;
  lastModified: number | null;
  path: DraftDocumentPath;
  possiblyWritable: boolean;
  readable: boolean;
  source: {
    contents: string;
    lastModified: number;
  } | null;
  writable: boolean;
}


export type DraftCandidateId = string;

export interface DraftCandidate {
  id: DraftCandidateId;
  path: DraftDocumentPath;

  /**
   * Create a {@link DraftInstance} from this candidate.
   */
  createInstance(): Promise<DraftInstance>;
}


export interface DraftDocumentWatcher {
  closed: Promise<void>;

  add(documentIds: Iterable<DraftDocumentId>): Promise<void>;
  remove(documentIds: Iterable<DraftDocumentId>): void;
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

  /**
   * Watch a set of documents for changes.
   *
   * The callback is not called immediately after calling `watchDocuments()` nor after writing to a document with {@link DraftDocument.write}.
   *
   * @returns A watcher object that can be used to add or remove documents to watch.
   */
  watchDocuments(callback: (changedDocumentIds: Set<DraftDocumentId>) => void, options: { signal: AbortSignal; }): DraftDocumentWatcher;
}

export interface AppBackendSnapshot {
  documents: Record<DraftDocumentId, DraftDocumentSnapshot>;
  drafts: Record<DraftInstanceId, DraftInstanceSnapshot>;
}

export interface AppBackendClass {
  new(): AppBackend;
}
