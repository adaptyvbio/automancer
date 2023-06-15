import * as idb from 'idb-keyval';

import { HostSettings, HostSettingsData, HostSettingsId } from '../interfaces/host';
import { getRecordSnapshot, SnapshotProvider } from '../snapshot';
import * as util from '../util';
import { Pool } from '../util';
import { AppBackend, AppBackendSnapshot, DraftCandidate, DraftDocument, DraftDocumentExtension, DraftDocumentId, DraftDocumentPath, DraftDocumentSnapshot, DraftDocumentWatcher, DraftInstance, DraftInstanceId, DraftInstanceSnapshot } from './base';
import { DraftId, DraftPrimitive } from '../draft';
import { AppBackend, DraftItem } from './base';
import * as util from '../util';
import { BrowserStorageStore } from '../store/browser-storage';
import { Store } from '../store/base';


interface BrowserStoreMainEntry {
  version: number;
}

export type BrowserStoreDraftsEntry = Record<DraftInstanceId, {
  entryDocumentHandle: FileSystemFileHandle;
  name: string | null;
  rootHandle: FileSystemDirectoryHandle | null;
}>;

export type BrowserStoreHostSettingsEntry = HostSettingsData;


export class BrowserDraftDocument extends SnapshotProvider<DraftDocumentSnapshot> implements DraftDocument {
  id: DraftDocumentId = crypto.randomUUID();
  lastModified: number | null = null;
  readonly = false;
  source: {
    contents: string;
    lastModified: number;
  } | null = null;

  readable: boolean = false;
  writable: boolean = false;

  _attachedDraftInstances = new Set<BrowserDraftInstance>();
  _handle: FileSystemFileHandle;
  _loadingPromise: Promise<void> | null = null;
  _writing = false;

  constructor(handle: FileSystemFileHandle) {
    super();
    this._handle = handle;
  }

  protected _createSnapshot(): DraftDocumentSnapshot {
    return {
      model: this,

      id: this.id,
      deleted: false,
      lastModified: this.lastModified,
      path: [this._handle.name],
      possiblyWritable: true,
      readable: this.readable,
      source: this.source,
      writable: this.writable
    };
  }

  async _initialize() {
    this.readable = ((await this._handle.queryPermission({ mode: 'read' })) === 'granted');
    this.writable = ((await this._handle.queryPermission({ mode: 'readwrite' })) === 'granted');
  }

  async _load() {
    if (!this._loadingPromise) {
      this._loadingPromise = (async () => {
        let file = await this._handle.getFile();

        if (file.lastModified !== this.lastModified) {
          this.lastModified = file.lastModified;
          this.source = {
            contents: await file.text(),
            lastModified: file.lastModified
          };

          this._update();
        }

        this._loadingPromise = null;
      })();
    }

    await this._loadingPromise;
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

  async write(contents: string) {
    if (this._writing) {
      throw new Error('Already writing');
    }

    this._writing = true;

    let writable = await this._handle.createWritable();
    await writable.write(contents);
    await writable.close();

    let file = await this._handle.getFile();

    this.lastModified = file.lastModified;
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

  _attachedDocuments = new Set<BrowserDraftDocument>();
  _rootHandle: FileSystemDirectoryHandle | null;

  #appBackend: BrowserAppBackend;

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

    this.#appBackend = appBackend;

    this.entryDocument = options.entryDocument;
    this.id = options.id ?? crypto.randomUUID();
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

    let document = await this.#appBackend._createDocument(documentHandle);
    this._attachedDocuments.add(document);

    return document;
  }

  async remove() {
    await idb.update<BrowserStoreDraftsEntry>('drafts', (entry) => {
      let { [this.id]: _, ...rest } = (entry ?? {});
      return rest;
    }, this.#appBackend._store);

    delete this.#appBackend.draftInstances[this.id];
    this.#appBackend._update();
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
    }), this.#appBackend._store);
  }
}


export class BrowserDraftDocumentWatcher implements DraftDocumentWatcher {
  closed: Promise<void>;

  private _appBackend: BrowserAppBackend;
  private _callback: ((changedDocumentIds: Set<DraftDocumentId>) => void);
  private _documents = new Set<BrowserDraftDocument>();
  private _pool = new Pool();
  private _signal: AbortSignal;
  private _timeoutId!: number | null;

  constructor(callback: ((changedDocumentIds: Set<DraftDocumentId>) => void), options: { signal: AbortSignal; }, appBackend: BrowserAppBackend) {
    this._appBackend = appBackend;
    this._callback = callback;
    this._signal = options.signal;

    this._planPoll();

    this.closed = new Promise<void>((resolve) => {
      this._signal.addEventListener('abort', () => void resolve());
    }).then(async () => {
      if (this._timeoutId !== null) {
        clearTimeout(this._timeoutId);
        this._timeoutId = null;
      }

      await this._pool.wait();
    });
  }

  async _poll() {
    for (let document of this._documents) {
      if (document.readable && !document._writing) {
        await document._load();
      }
    }
  }

  // async _old_poll() {
  //   let changedDocumentIds = new Set<DraftDocumentId>();

  //   for (let document of this._documents) {
  //     if (document.readable && !document._writing) {
  //       let file = await document._handle.getFile();

  //       if (file.lastModified !== document.lastModified) {
  //         changedDocumentIds.add(document.id);

  //         document.lastModified = file.lastModified;
  //         document.source = await file.text();
  //         document._update();
  //       }
  //     }
  //   }

  //   if (this._signal.aborted) {
  //     return;
  //   }

  //   // Make sure that changed documents have not been removed from the watcher.
  //   for (let changedDocumentId of changedDocumentIds) {
  //     let document = this._appBackend._documents[changedDocumentId];

  //     if (!document || !this._documents.has(document)) {
  //       changedDocumentIds.delete(changedDocumentId);
  //     }
  //   }

  //   if (changedDocumentIds.size > 0) {
  //     this._callback(changedDocumentIds);
  //   }

  //   this._planPoll();
  // }

  _planPoll() {
    this._timeoutId = setTimeout(() => {
      this._pool.add(this._poll());
    }, 1000);
  }

  async add(documentIds: Iterable<string>) {
    let documents = Array.from(documentIds).map((id) => this._appBackend._documents[id]);

    for (let document of documents) {
      document.watchSnapshot(() => {
        this._callback(new Set([document.id]));
      });
    }

    for (let document of documents) {
      if (document.readable) {
        await document._load();
      }
    }

    for (let document of documents) {
      this._documents.add(document);
    }
  }

  remove(documentIds: Iterable<string>) {
    for (let documentId of documentIds) {
      this._documents.delete(this._appBackend._documents[documentId]);
    }
  }
}


export class BrowserAppBackend extends SnapshotProvider<AppBackendSnapshot> implements AppBackend {
  static version = 1;

  draftInstances!: Record<DraftInstanceId, BrowserDraftInstance>;

  _documents: Record<DraftDocumentId, BrowserDraftDocument> = {};
  _store = idb.createStore('pr1', 'data');

  protected _createSnapshot() {
    return {
      documents: getRecordSnapshot(this._documents),
      drafts: getRecordSnapshot(this.draftInstances)
    };
  }

  async initialize() {
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }


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
          id,
          entryDocument: await this._createDocument(item.entryDocumentHandle),
          name: item.name,
          rootHandle: item.rootHandle
        }, this)]))
      )
    );
  }


  createStore(name: string, options: { type: 'persistent' | 'session'; }) {
    return new BrowserStorageStore(options.type === 'persistent' ? localStorage : sessionStorage, name);
  }

  async deleteHostSettings(hostSettingsId: HostSettingsId) {
    await idb.update<BrowserStoreHostSettingsEntry>('hosts', (hostSettingsEntry) => {
      let { [hostSettingsId]: _, ...hosts } = hostSettingsEntry!.hosts;

      return {
        ...hostSettingsEntry!,
        hosts
      };
    }, this._store);
  }

  async initialize() {
    // if (Notification.permission === 'default') {
    //   await Notification.requestPermission();
    // }

    // return hostSettingsEntry;
  }

  async setDefaultHostSettings(hostSettingsId: HostSettingsId | null) {
    await idb.update<BrowserStoreHostSettingsEntry>('hosts', (hostSettingsEntry) => ({
      ...hostSettingsEntry!,
      defaultHostSettingsId: hostSettingsId
    }), this._store);
  }

  async setHostSettings(settings: HostSettings) {
    await idb.update<BrowserStoreHostSettingsEntry>('hosts', (hostSettingsEntry) => ({
      ...hostSettingsEntry!,
      hosts: {
        ...hostSettingsEntry!.hosts,
        [settings.id]: settings
      }
    }), this._store);
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

  watchDocuments(callback: (changedDocumentIds: Set<DraftDocumentId>) => void, options: { signal: AbortSignal; }) {
    return new BrowserDraftDocumentWatcher(callback, options, this);
  }

  async _createInstanceFromCandidate(entryDocumentHandle: FileSystemFileHandle, rootHandle: FileSystemDirectoryHandle | null) {
    for (let draftInstance of Object.values(this.draftInstances)) {
      if (await draftInstance.entryDocument._handle.isSameEntry(entryDocumentHandle)) {
        return draftInstance;
      }
    }

    let draftInstance = new BrowserDraftInstance({
      entryDocument: await this._createDocument(entryDocumentHandle),
      rootHandle
    }, this);

    await draftInstance._save();

    this.draftInstances[draftInstance.id] = draftInstance;
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
    this._update();

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
