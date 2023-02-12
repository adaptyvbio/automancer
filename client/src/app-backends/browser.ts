import * as idb from 'idb-keyval';

import { DraftId, DraftPrimitive } from '../draft';
import { AppBackend, AppBackendSnapshot, DraftCandidate, DraftDocument, DraftDocumentExtension, DraftDocumentId, DraftDocumentPath, DraftDocumentSnapshot, DraftInstance, DraftInstanceId, DraftInstanceSnapshot } from './base';
import * as util from '../util';
import { HostId } from '../backends/common';
import { HostSettings, HostSettingsData, HostSettingsId } from '../interfaces/host';
import { getRecordSnapshot, SnapshotProvider } from '../snapshot';


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
  readonly: boolean = false;
  source: string | null = null;

  readable: boolean = false;
  writable: boolean = false;

  _attachedDraftInstances = new Set<BrowserDraftInstance>();
  _handle: FileSystemFileHandle;

  constructor(handle: FileSystemFileHandle) {
    super();
    this._handle = handle;
  }

  protected _createSnapshot(): DraftDocumentSnapshot {
    return {
      model: this,

      id: this.id,
      lastModified: this.lastModified,
      path: [this._handle.name],
      readonly: this.readonly
    };
  }

  async _initialize() {
    this.readable = ((await this._handle.queryPermission({ mode: 'read' })) === 'granted');
    this.writable = ((await this._handle.queryPermission({ mode: 'readwrite' })) === 'granted');
  }

  async write(contents: string) {
    let writable = await this._handle.createWritable();
    await writable.write(contents);
    await writable.close();

    let file = await this._handle.getFile();

    this.lastModified = file.lastModified;
    this._update();

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

  async watch(handler: (documentIds: Set<DraftDocumentId>) => void, options: { signal: AbortSignal; }) {

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


  async deleteHostSettings(hostSettingsId: HostSettingsId) {
    await idb.update<BrowserStoreHostSettingsEntry>('hosts', (hostSettingsEntry) => {
      let { [hostSettingsId]: _, ...hosts } = hostSettingsEntry!.hosts;

      return {
        ...hostSettingsEntry!,
        hosts
      };
    }, this._store);
  }

  async getHostSettingsData() {
    return {
      defaultHostSettingsId: 'foo',
      hosts: {
        'foo': {
          id: 'foo',
          label: 'PC',
          options: {
            type: 'remote' as const,
            auth: null,
            address: 'localhost',
            port: 4567
          }
        }
      }
    };

    // let hostSettingsEntry = await idb.get<HostSettingsEntry>('hosts', this.#store);

    // if (!hostSettingsEntry) {
    //   hostSettingsEntry = {
    //     defaultHostSettingsId: null,
    //     hosts: {}
    //   };

    //   await idb.set('hosts', hostSettingsEntry, this.#store);
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

          createInstance: async () => await this.#createInstanceFromCandidate(handle, rootHandle)
        });
      }
    }

    return candidates;
  }

  async #createInstanceFromCandidate(entryDocumentHandle: FileSystemFileHandle, rootHandle: FileSystemDirectoryHandle | null) {
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
