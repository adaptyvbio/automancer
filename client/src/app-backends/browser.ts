import * as idb from 'idb-keyval';
import hash from 'object-hash';

import { Lock } from 'pr1-shared';

import { getRecordSnapshot, SnapshotProvider } from '../snapshot';
import { BrowserStorageStore } from '../store/browser-storage';
import { assert, Pool, wrapAbortable } from '../util';
import { AppBackend, AppBackendSnapshot, DocumentId, DocumentInstanceSnapshot, DocumentPath, DocumentSlot, DocumentSlotSnapshot, DocumentSlotStatus, DraftDocumentExtension, DraftInstance, DraftInstanceId, DraftInstanceSnapshot } from './base';


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


export class BrowserDocumentSlot extends SnapshotProvider<DocumentSlotSnapshot> implements DocumentSlot {
  id: DocumentId;

  private _handle: FileSystemFileHandle | null = null;
  private _instance: DocumentInstanceSnapshot | null = null;
  private _pollTimeoutId: number | null = null;
  private _status: DocumentSlotStatus;
  private _watchSignal: AbortSignal | null = null;
  private _writeLock = new Lock();
  private _writing = false;

  constructor(
    private _draftInstance: BrowserDraftInstance,
    private _path: DocumentPath,
    handle: FileSystemFileHandle | null
  ) {
    super();

    if (handle) {
      this._handle = handle;
      this._status = 'loading';

      this._pool.add(async () => {
        await this._initializeHandle();
      });
    } else {
      this._status = 'unwatched';
    }

    this.id = hash([this._draftInstance.id, this._path]) as DocumentId;
  }

  get _pool() {
    return this._draftInstance._pool;
  }

  private async _initializeHandle() {
    assert(this._handle);

    this._status = 'loading';

    let readPermissionState = await this._handle.queryPermission({ mode: 'read' });

    // await new Promise((r) => void setTimeout(r, 600));

    if (readPermissionState === 'granted') {
      await this._load();
    } else {

      this._instance = null;
      this._status = (readPermissionState === 'denied') ? 'unreadable' as const : 'prompt' as const;
      this._update();
    }
  }

  async _load() {
    assert(this._handle);

    let file: File | null = null;

    if (!this._writing) {
      try {
        file = await this._handle.getFile();
      } catch (err: any) {
        switch (err.name) {
          case 'NotAllowedError':
            await this._initializeHandle();
            return;

          case 'NotFoundError': {
            let oldStatus = this._status;
            this._instance = null;
            this._status = 'missing';

            if (this._status !== oldStatus) {
              this._update();
            }

            break;
          }

          default:
            throw err;
        }
      }
    }

    if (file) {
      if (!this._instance) {
        this._instance = {
          contents: await file.text(),
          lastExternalModificationDate: file.lastModified,
          lastModificationDate: file.lastModified,
          possiblyWritable: true,
          writable: true
        };

        this._status = 'ok';
        this._update();
      } else if (file.lastModified !== this._instance.lastModificationDate) {
        this._instance.contents = await file.text();
        this._instance.lastExternalModificationDate = file.lastModified;
        this._instance.lastModificationDate = file.lastModified;

        this._status = 'ok';
        this._update();
      } else {
        this._status = 'ok';
      }
    }

    if (this._shouldPoll()) {
      this._poll();
    }
  }

  // private async _queryHandle() {
  //   return await findFile(this._draftInstance._container!.rootHandle, this._path);
  // }

  private _poll() {
    this._pollTimeoutId = setTimeout(() => {
      this._pollTimeoutId = null;

      this._pool.add(async () => {
        await this._load();
      });
    }, 1000);
  }

  private _shouldPoll() {
    return this._handle && ['ok', 'missing'].includes(this._status);
  }

  async request() {
    assert(this._handle);

    try {
      let readonly = false;
      await this._handle.requestPermission({ mode: (readonly ? 'read' : 'readwrite') });
    } catch (err: any) {
      switch (err.name) {
        case 'SecurityError':
          return;
        default:
          throw err;
      }
    }

    await this._initializeHandle();
  }

  watch(options: { signal: AbortSignal; }) {
    if (this._watchSignal) {
      throw new Error('Already watching');
    }

    if (this._shouldPoll()) {
      this._poll();
    }

    this._watchSignal = options.signal;
    this._watchSignal.addEventListener('abort', () => {
      this._watchSignal = null;

      if (this._pollTimeoutId !== null) {
        clearTimeout(this._pollTimeoutId);
        this._pollTimeoutId = null;
      }
    });
  }

  async write(contents: string) {
    return this._writeLock.acquireWith(async () => {
      if (!this._instance) {
        throw new TypeError('Missing instance');
      }

      // (this._instance !== null) => (this._handle !== null)
      assert(this._handle);

      let writable = await this._handle.createWritable();

      this._writing = true;

      await writable.write(contents);
      await writable.close();

      let file = await this._handle.getFile();

      this._writing = false;

      this._instance.contents = contents;
      this._instance.lastModificationDate = file.lastModified;

      this._update();
    });
  }

  protected override _createSnapshot(): DocumentSlotSnapshot {
    return {
      model: this,

      id: this.id,
      instance: this._instance && {
        ...this._instance
      },
      path: this._path,
      status: this._status
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

  get _pool() {
    return this._appBackend._pool;
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

  async setName(name: string) {
    this.name = name;

    this._update();
    this._appBackend._update();

    await this._save();
  }

  async _save() {
    await idb.update<BrowserStoreDraftsEntry>('drafts', (entry) => ({
      ...entry,
      [this.id]: {
        id: this.id,
        container: this._container,
        entryHandle: this._entryHandle,
        name: this.name
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

  _pool = new Pool();
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

  async queryDraft(options: { directory: boolean; }) {
    let selectedHandle = options.directory
      ? await wrapAbortable(window.showDirectoryPicker())
      : (await wrapAbortable(window.showOpenFilePicker()))?.[0];

    if (!selectedHandle) {
      return null;
    }


    for await (let { handle, path } of walkFilesystemHandle(selectedHandle)) {
      let rootHandle = (selectedHandle.kind === 'directory') ? selectedHandle : null;

      if (handle.name.endsWith(DraftDocumentExtension)) {
        return await this._createInstanceFromCandidate(handle, rootHandle);
      }
    }

    return null;
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
