import * as idb from 'idb-keyval';

import { getRecordSnapshot, SnapshotProvider } from '../snapshot';
import { BrowserStorageStore } from '../store/browser-storage';
import * as util from '../util';
import { Pool } from '../util';
import { AppBackend, AppBackendSnapshot, DraftCandidate, DraftDocument, DraftDocumentExtension, DraftDocumentId, DraftDocumentPath, DraftDocumentSnapshot, DraftInstance, DraftInstanceId, DraftInstanceSnapshot } from './base';


interface BrowserStoreMainEntry {
  version: number;
}

export type BrowserStoreDraftsEntry = Record<DraftInstanceId, {
  entryDocumentHandle: FileSystemFileHandle;
  name: string | null;
  rootHandle: FileSystemDirectoryHandle | null;
}>;


export class BrowserDraftDocument extends SnapshotProvider<DraftDocumentSnapshot> implements DraftDocument {
  id = crypto.randomUUID() as DraftDocumentId;
  contents: string | null = null;
  lastExternalModificationDate: number | null = null;
  lastModificationDate: number | null = null;
  readonly = false;

  readable: boolean = false;
  writable: boolean = false;

  _handle: FileSystemFileHandle;
  private _loadingPromise: Promise<void> | null = null;
  private _polling = false;
  private _pollTimeoutId: number | null = null;
  private _pool = new Pool();
  private _watcherCount = 0;
  private _writing = false;

  constructor(handle: FileSystemFileHandle) {
    super();
    this._handle = handle;
  }

  protected _createSnapshot(): DraftDocumentSnapshot {
    return {
      model: this,

      id: this.id,
      contents: this.contents,
      deleted: false,
      lastExternalModificationDate: this.lastExternalModificationDate,
      lastModificationDate: this.lastModificationDate,
      path: [this._handle.name],
      possiblyWritable: true,
      readable: this.readable,
      writable: this.writable
    };
  }

  async _initialize() {
    this.readable = ((await this._handle.queryPermission({ mode: 'read' })) === 'granted');
    this.writable = ((await this._handle.queryPermission({ mode: 'readwrite' })) === 'granted');
  }

  private async _load() {
    if (!this._loadingPromise) {
      this._loadingPromise = (async () => {
        let file = await this._handle.getFile();

        if (file.lastModified !== this.lastModificationDate) {
          this.contents = await file.text();
          this.lastExternalModificationDate = file.lastModified;
          this.lastModificationDate = file.lastModified;

          this._update();
        }

        this._loadingPromise = null;
      })();
    }

    await this._loadingPromise;
  }

  private _poll() {
    this._pollTimeoutId = setTimeout(() => {
      this._pollTimeoutId = null;

      this._pool.add(async () => {
        await this._load();

        if (this._polling) {
          this._poll();
        }
      });
    }, 1000);
  }

  private _shouldPoll() {
    return (this._watcherCount > 0) && this.readable;
  }

  private _updatePolling() {
    if (this._polling && !this._shouldPoll()) {
      this._polling = false;

      if (this._pollTimeoutId !== null) {
        clearTimeout(this._pollTimeoutId);
        this._pollTimeoutId = null;
      }
    }

    if (!this._polling && this._shouldPoll()) {
      this._polling = true;

      this._pool.add(async () => {
        await this._load();
        this._poll();
      });
    }
  }

  async request() {
    try {
      if (this.readonly) {
        this.readable = ((await this._handle.requestPermission({ mode: 'read' })) === 'granted');
      } else {
        this.writable = ((await this._handle.requestPermission({ mode: 'readwrite' })) === 'granted');
        this.readable = this.writable;
      }
    } catch (err) {
      if ((err as { name: string; }).name === 'SecurityError') {
        return;
      }

      throw err;
    }

    this._update();

    if (this.readable) {
      await this._load();
    }
  }

  async watchContents(options: { signal: AbortSignal; }) {
    this._watcherCount += 1;
    this._updatePolling();

    options.signal.addEventListener('abort', () => {
      this._watcherCount -= 1;
      this._updatePolling();
    });
  }

  async write(contents: string) {
    if (this._writing) {
      throw new Error('Already writing');
    }

    this._writing = true;

    let writable = await this._handle.createWritable();
    await writable.write(contents);
    await writable.close();

    let file = await this._handle.getFile();

    this.lastModificationDate = file.lastModified;
    this._update();
    this._writing = false;

    return {
      lastModified: file.lastModified
    };
  }
}

export class BrowserDraftInstance extends SnapshotProvider<DraftInstanceSnapshot> implements DraftInstance<BrowserDraftDocument> {
  id: DraftInstanceId;
  entryDocument: BrowserDraftDocument;
  name: string | null;

  _appBackend: BrowserAppBackend;
  _attachedDocuments = new Set<BrowserDraftDocument>();
  _rootHandle: FileSystemDirectoryHandle | null;

  constructor(
    options: {
      id?: DraftInstanceId;
      entryDocument: BrowserDraftDocument;
      name?: string | null;
      rootHandle: FileSystemDirectoryHandle | null;
    },
    appBackend: BrowserAppBackend
  ) {
    super();

    this._appBackend = appBackend;

    this.entryDocument = options.entryDocument;
    this.id = options.id ?? (crypto.randomUUID() as DraftInstanceId);
    this.name = options.name ?? null;

    this._rootHandle = options.rootHandle;
  }

  protected _createSnapshot(): DraftInstanceSnapshot {
    return {
      model: this,

      id: this.id,
      entryDocumentId: this.entryDocument.id,
      name: this.name
    };
  }

  async detachDocument(document: BrowserDraftDocument) {
    this._attachedDocuments.delete(document);
  }

  async getDocument(path: DraftDocumentPath) {
    if (!this._rootHandle) {
      return null;
    }

    let documentHandle = await findFile(this._rootHandle, path);

    if (!documentHandle) {
      return null;
    }

    let document = await this._appBackend._createDocument(documentHandle);
    this._attachedDocuments.add(document);

    return document;
  }

  async remove() {
    await idb.update<BrowserStoreDraftsEntry>('drafts', (entry) => {
      let { [this.id]: _, ...rest } = (entry ?? {});
      return rest;
    }, this._appBackend._store);

    delete this._appBackend.draftInstances![this.id];
    this._appBackend._update();
  }

  async _save() {
    await idb.update<BrowserStoreDraftsEntry>('drafts', (entry) => ({
      ...entry,
      [this.id]: {
        id: this.id,
        entryDocumentHandle: this.entryDocument._handle,
        name: this.name,
        rootHandle: this._rootHandle
      }
    }), this._appBackend._store);
  }
}


export class BrowserAppBackend extends SnapshotProvider<AppBackendSnapshot> implements AppBackend {
  static version = 1;

  draftInstances: Record<DraftInstanceId, BrowserDraftInstance> | null = null;

  _documents: Record<DraftDocumentId, BrowserDraftDocument> = {};
  _store = idb.createStore('pr1', 'data');

  protected _createSnapshot() {
    return {
      documents: getRecordSnapshot(this._documents),
      drafts: getRecordSnapshot(this.draftInstances!)
    };
  }

  createStore(name: string, options: { type: 'persistent' | 'session'; }) {
    return new BrowserStorageStore(options.type === 'persistent' ? localStorage : sessionStorage, name);
  }

  async initialize() {
    // if (Notification.permission === 'default') {
    //   await Notification.requestPermission();
    // }

    let mainEntry = await idb.get<BrowserStoreMainEntry>('main', this._store);

    if (!mainEntry || (mainEntry.version !== BrowserAppBackend.version)) {
      mainEntry = {
        version: BrowserAppBackend.version
      };

      await idb.set('main', mainEntry, this._store);
    }


    let draftsEntry = await idb.get<BrowserStoreDraftsEntry>('drafts', this._store);

    this.draftInstances = Object.fromEntries(
      await Promise.all(
        Object.entries(draftsEntry ?? {}).map(async ([id, item]) => ([id, new BrowserDraftInstance({
          id: (id as DraftInstanceId),
          entryDocument: await this._createDocument(item.entryDocumentHandle),
          name: item.name,
          rootHandle: item.rootHandle
        }, this)]))
      )
    );

    this._update();
  }

  async queryDraftCandidates(options: { directory: boolean; }) {
    let selectedHandle = options.directory
      ? await util.wrapAbortable(window.showDirectoryPicker())
      : (await util.wrapAbortable(window.showOpenFilePicker()))?.[0];

    if (!selectedHandle) {
      return [];
    }


    let candidates: DraftCandidate[] = [];

    for await (let { handle, path } of walkFilesystemHandle(selectedHandle)) {
      let rootHandle = (selectedHandle.kind === 'directory') ? selectedHandle : null;

      if (handle.name.endsWith(DraftDocumentExtension)) {
        candidates.push({
          id: crypto.randomUUID(),
          path,

          createInstance: async () => await this._createInstanceFromCandidate(handle, rootHandle)
        });
      }
    }

    return candidates;
  }

  async _createInstanceFromCandidate(entryDocumentHandle: FileSystemFileHandle, rootHandle: FileSystemDirectoryHandle | null) {
    for (let draftInstance of Object.values(this.draftInstances!)) {
      if (await draftInstance.entryDocument._handle.isSameEntry(entryDocumentHandle)) {
        return draftInstance;
      }
    }

    let draftInstance = new BrowserDraftInstance({
      entryDocument: await this._createDocument(entryDocumentHandle),
      rootHandle
    }, this);

    await draftInstance._save();

    this.draftInstances![draftInstance.id] = draftInstance;
    this._update();

    return draftInstance;
  }

  async _createDocument(handle: FileSystemFileHandle) {
    for (let document of Object.values(this._documents)) {
      if (await document._handle.isSameEntry(handle)) {
        return document;
      }
    }

    let document = new BrowserDraftDocument(handle);
    await document._initialize();

    this._documents[document.id] = document;

    // If the app backend is not being initialized
    if (this.draftInstances) {
      this._update();
    }

    return document;
  }
}


export interface FileSystemFileHandleInfo {
  handle: FileSystemFileHandle;
  path: string[];
}

async function* walkFilesystemHandle(handle: FileSystemHandleUnion, parentPath: string[] = []): AsyncGenerator<FileSystemFileHandleInfo> {
  let handlePath = [...parentPath, handle.name];

  switch (handle.kind) {
    case 'directory':
      for await (let childHandle of handle.values()) {
        yield* walkFilesystemHandle(childHandle, handlePath);
      }

      break;
    case 'file':
      yield { handle, path: handlePath };
      break;
  }
}


export async function findFile(handle: FileSystemDirectoryHandle, path: string[]): Promise<FileSystemFileHandle | null> {
  for await (let childHandle of handle.values()) {
    if (childHandle.name === path[0]) {
      if ((childHandle.kind === 'file') && (path.length === 1)) {
        return childHandle;
      }

      if ((childHandle.kind === 'directory') && (path.length > 1)) {
        return findFile(childHandle, path.slice(1));
      }

      break;
    }
  }

  return null;
}
