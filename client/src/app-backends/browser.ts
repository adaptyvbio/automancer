import * as idb from 'idb-keyval';
import hash from 'object-hash';

import { getRecordSnapshot, SnapshotProvider, SnapshotWatchCallback } from '../snapshot';
import { BrowserStorageStore } from '../store/browser-storage';
import { Pool, wrapAbortable } from '../util';
import { AppBackend, AppBackendSnapshot, DraftCandidate, DocumentInstance, DraftDocumentExtension, DocumentId, DocumentPath, DocumentSlot, DocumentSlotSnapshot, DocumentInstanceSnapshot, DraftInstance, DraftInstanceId, DraftInstanceSnapshot } from './base';


interface BrowserStoreMainEntry {
  version: number;
}

export type BrowserStoreDraftsEntry = Record<DraftInstanceId, BrowserStoreDraftsItem>;

export interface BrowserStoreDraftsItem {
  id: DraftInstanceId;
  container: {
    entryPath: DocumentPath;
    rootHandle: FileSystemDirectoryHandle;
  };
  entryHandle: FileSystemFileHandle;
  name: string | null;
}


export class BrowserDocument extends SnapshotProvider<DocumentInstanceSnapshot> implements DocumentInstance {
  id = crypto.randomUUID() as DocumentId;
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

  protected _createSnapshot(): DocumentInstanceSnapshot {
    return {
      model: this,

      id: this.id,
      contents: this.contents,
      lastExternalModificationDate: this.lastExternalModificationDate,
      lastModificationDate: this.lastModificationDate,
      possiblyWritable: true,
      readable: this.readable,
      writable: this.writable
    };
  }

  async _readPermissions() {
    this.readable = ((await this._handle.queryPermission({ mode: 'read' })) === 'granted');
    this.writable = ((await this._handle.queryPermission({ mode: 'readwrite' })) === 'granted');

    this._update();
    this._updatePolling();

    if (this.readable) {
      await this._load();
    }
  }

  private async _load() {
    if (!this._loadingPromise) {
      this._loadingPromise = (async () => {
        try {
          let file: File | null = null;

          try {
            file = await this._handle.getFile();
          } catch (err: any) {
            if (err.name === 'NotAllowedError') {
              await this._readPermissions();
              return;
            }

            throw err;
          }

          if (!file) {
            return;
          }

          if (file.lastModified !== this.lastModificationDate) {
            this.contents = await file.text();
            this.lastExternalModificationDate = file.lastModified;
            this.lastModificationDate = file.lastModified;

            this._update();
          }
        } finally {
          this._loadingPromise = null;
        }
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

  async _watchContents(options: { signal: AbortSignal; }) {
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

export class BrowserDocumentSlot extends SnapshotProvider<DocumentSlotSnapshot> implements DocumentSlot {
  document: BrowserDocument | null = null;
  id: DocumentId;

  private _watchSignal: AbortSignal | null = null;

  constructor(
    private _draftInstance: BrowserDraftInstance,
    private _path: DocumentPath,
    handle: FileSystemFileHandle | null
  ) {
    super();

    if (handle) {
      this._initialize(handle);
    }

    this.id = hash([this._draftInstance.id, this._path]) as DocumentId;
  }

  async _initialize(handle: FileSystemFileHandle) {
    let document = new BrowserDocument(handle);

    document._readPermissions().then(() => {
      this.document = document;
      this._update();

      document.watchSnapshot(() => void this._update());

      if (this._watchSignal) {
        document._watchContents({ signal: this._watchSignal });
      }
    });
  }

  watch(options: { signal: AbortSignal; }) {
    (async () => {
      // if (!this.document) {
      //   let handle = await findFile(this._draftInstance._container!.rootHandle, this._path);

      //   if (handle) {
      //     await this._initialize(handle);
      //   }
      // }

      this.document?._watchContents(options);
      this._watchSignal = options.signal;
    })();
  }

  protected override _createSnapshot() {
    return {
      id: this.id,
      document: this.document?.getSnapshot() ?? null,
      path: this._path
    };
  }
}

export class BrowserDraftInstance extends SnapshotProvider<DraftInstanceSnapshot> implements DraftInstance {
  id: DraftInstanceId;
  name: string | null;

  private _appBackend: BrowserAppBackend;
  // _attachedDocuments = new Set<DraftDocument>();
  _container: {
    entryPath: DocumentPath;
    rootHandle: FileSystemDirectoryHandle;
  } | null;
  private _entryDocumentSlot: BrowserDocumentSlot;
  _entryHandle: FileSystemFileHandle;

  constructor(
    options: {
      id?: DraftInstanceId;
      container: {
        entryPath: DocumentPath;
        rootHandle: FileSystemDirectoryHandle;
      } | null;
      name?: string | null;
      entryHandle: FileSystemFileHandle;
    },
    appBackend: BrowserAppBackend
  ) {
    super();

    this._appBackend = appBackend;

    this.id = options.id ?? (crypto.randomUUID() as DraftInstanceId);
    this.name = options.name ?? null;

    this._container = options.container;
    this._entryHandle = options.entryHandle;

    this._entryDocumentSlot = new BrowserDocumentSlot(this, this._container?.entryPath ?? [this._entryHandle.name], this._entryHandle);
  }

  protected _createSnapshot(): DraftInstanceSnapshot {
    return {
      model: this,

      id: this.id,
      name: this.name
    };
  }

  // async detachDocument(document: BrowserDocument) {
  //   this._attachedDocuments.delete(document);
  // }

  // async getDocument(path: DocumentPath) {
  //   if (!this._container) {
  //     return null;
  //   }

  //   let documentHandle = await findFile(this._container.rootHandle, path);

  //   if (!documentHandle) {
  //     return null;
  //   }

  //   let document = await this._appBackend._createDocument(documentHandle);
  //   // this._attachedDocuments.add(document);

  //   return document;
  // }

  getEntryDocumentSlot() {
    return this._entryDocumentSlot;
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
        container: this._container,
        entryHandle: this._entryHandle,
        name: this.name,
      }
    }), this._appBackend._store);
  }

  static _loadFromStoreEntry(item: BrowserStoreDraftsItem, appBackend: BrowserAppBackend) {
    return new BrowserDraftInstance({
      id: item.id,
      container: item.container,
      entryHandle: item.entryHandle,
      name: item.name
    }, appBackend);
  }
}


export class BrowserAppBackend extends SnapshotProvider<AppBackendSnapshot> implements AppBackend {
  static version = 1;

  draftInstances: Record<DraftInstanceId, BrowserDraftInstance> | null = null;

  _documents: Record<DocumentId, BrowserDocument> = {};
  _store = idb.createStore('pr1', 'data');

  protected _createSnapshot(): AppBackendSnapshot {
    return {
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
      Object.entries(draftsEntry ?? {}).map(([id, item]) => ([id, BrowserDraftInstance._loadFromStoreEntry(item, this)]))
    );

    this._update();
  }

  async queryDraftCandidates(options: { directory: boolean; }) {
    let selectedHandle = options.directory
      ? await wrapAbortable(window.showDirectoryPicker())
      : (await wrapAbortable(window.showOpenFilePicker()))?.[0];

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

  async _createInstanceFromCandidate(entryHandle: FileSystemFileHandle, rootHandle: FileSystemDirectoryHandle | null) {
    for (let draftInstance of Object.values(this.draftInstances!)) {
      if (await draftInstance._entryHandle.isSameEntry(entryHandle)) {
        return draftInstance;
      }
    }

    let draftInstance = new BrowserDraftInstance({
      container: rootHandle && {
        entryPath: (await rootHandle.resolve(entryHandle))!,
        rootHandle
      },
      entryHandle
    }, this);

    await draftInstance._save();

    this.draftInstances![draftInstance.id] = draftInstance;
    this._update();

    return draftInstance;
  }

  // async _createDocument(handle: FileSystemFileHandle) {
  //   for (let document of Object.values(this._documents)) {
  //     if (await document._handle.isSameEntry(handle)) {
  //       return document;
  //     }
  //   }

  //   let document = new DraftDocument(handle);
  //   await document._initialize();

  //   this._documents[document.id] = document;

  //   // If the app backend is not being initialized
  //   if (this.draftInstances) {
  //     this._update();
  //   }

  //   return document;
  // }
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
