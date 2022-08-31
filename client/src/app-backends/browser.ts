import * as idb from 'idb-keyval';

import { DraftId, DraftPrimitive } from '../draft';
import { AppBackend, DraftItem } from './base';
import * as util from '../util';
import { HostId } from '../backends/common';
import type { HostSettings } from '../host';


interface MainEntry {
  draftIds: DraftId[];
  version: number;
}

interface DraftEntry {
  id: DraftId;
  name: string | null;

  location: {
    type: 'app';
    lastModified: number;
    source: string;
  } | {
    type: 'private-filesystem';
    handle: FileSystemDirectoryHandle;
  } | {
    type: 'user-filesystem';
    handle: FileSystemDirectoryHandle | FileSystemFileHandle;
    mainFilePath: string;
  };
}

interface HostSettingsEntry {
  defaultHostSettingsId: HostId | null;
  hosts: Record<HostId, HostSettings>;
}


export class BrowserAppBackend implements AppBackend {
  static version = 1;

  #draftIds!: Set<DraftId>;
  #store = idb.createStore('pr1', 'data');
  #storage!: FileSystemDirectoryHandle;

  constructor() {
  }

  async deleteHostSettings(settingsId: string) {
    await idb.update<HostSettingsEntry>('hosts', (hostSettingsEntry) => {
      let { [settingsId]: _, ...hosts } = hostSettingsEntry!.hosts;

      return {
        ...hostSettingsEntry!,
        hosts
      };
    }, this.#store);
  }

  async getHostSettingsData() {
    let hostSettingsEntry = await idb.get<HostSettingsEntry>('hosts', this.#store);

    if (!hostSettingsEntry) {
      hostSettingsEntry = {
        defaultHostSettingsId: null,
        hosts: {}
      };

      await idb.set('hosts', hostSettingsEntry, this.#store);
    }

    return hostSettingsEntry;
  }

  async setDefaultHostSettings(settingsId: string | null) {
    await idb.update<HostSettingsEntry>('hosts', (hostSettingsEntry) => ({
      ...hostSettingsEntry!,
      defaultHostSettingsId: settingsId
    }), this.#store);
  }

  async setHostSettings(settings: HostSettings) {
    await idb.update<HostSettingsEntry>('hosts', (hostSettingsEntry) => ({
      ...hostSettingsEntry!,
      hosts: {
        ...hostSettingsEntry!.hosts,
        [settings.id]: settings
      }
    }), this.#store);
  }


  async initialize() {
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }

    this.#storage = await navigator.storage.getDirectory();


    let mainEntry = await idb.get<MainEntry>('main', this.#store);

    if (!mainEntry || (mainEntry.version !== BrowserAppBackend.version)) {
      mainEntry = {
        draftIds: [],
        version: BrowserAppBackend.version
      };

      await idb.set('main', mainEntry, this.#store);
    }

    this.#draftIds = new Set(mainEntry.draftIds);
  }

  async notify(message: string) {
    if (Notification.permission === 'granted') {
      new Notification(message);
    }
  }

  async createDraft(options: { directory: boolean; source: string; }) {
    let fileNameInDirectory = 'main.yml';

    let handle = await util.wrapAbortable<FileSystemDirectoryHandle | FileSystemFileHandle>(
      options.directory
        ? window.showDirectoryPicker()
        : window.showSaveFilePicker({
          suggestedName: 'main.yml'
        })
    );

    if (!handle) {
      return null;
    }

    let draftEntry: DraftEntry = {
      id: crypto.randomUUID(),
      name: null,

      location: {
        type: 'user-filesystem',
        handle,
        mainFilePath: (handle.kind === 'directory') ? fileNameInDirectory : handle.name
      }
    };

    let fileHandle = (handle.kind === 'directory')
      ? await handle.getFileHandle(fileNameInDirectory, { create: true })
      : handle;
    let writable = await fileHandle.createWritable();

    await writable.write(options.source);
    await writable.close();

    this.#draftIds.add(draftEntry.id);

    await idb.update<MainEntry>('main', (mainEntry) => ({
      ...mainEntry!,
      draftIds: [...this.#draftIds]
    }), this.#store);

    await idb.set(draftEntry.id, draftEntry, this.#store);

    let draftItem = new BrowserAppBackendDraftItem(draftEntry, this);
    await draftItem._initialize();

    return draftItem;
  }

  async deleteDraft(draftId: string): Promise<void> {
    let draftEntry = (await idb.get<DraftEntry>(draftId, this.#store))!;

    // if (draftEntry.location.type === 'private-filesystem') {
    //   // TODO: Replace once stable
    //   // await draftEntry.location.handle.remove();

    //   await this.#storage.removeEntry(draftEntry.location.handle.name);
    // }

    this.#draftIds.delete(draftId);

    await idb.update<MainEntry>('main', (mainEntry) => ({
      ...mainEntry!,
      draftIds: [...this.#draftIds]
    }), this.#store);

    await idb.del(draftId, this.#store);
  }

  async listDrafts() {
    let mainEntry = (await idb.get<MainEntry>('main', this.#store))!;
    let draftEntries = await idb.getMany<DraftEntry>(mainEntry.draftIds, this.#store);

    return await Promise.all(
      draftEntries.map(async (draftEntry) => {
        let draftItem = new BrowserAppBackendDraftItem(draftEntry, this);
        await draftItem._initialize();

        return draftItem;
      })
    );
  }

  async loadDraft(options: { directory: boolean; }): Promise<DraftItem | null> {
    let handle = options.directory
      ? await util.wrapAbortable(window.showDirectoryPicker())
      : (await util.wrapAbortable(window.showOpenFilePicker()))?.[0];

    if (!handle) {
      return null;
    }


    let mainFilePath: string | null = null;

    switch (handle.kind) {
      case 'directory': {
        for await (let childHandle of handle.values()) {
          if ((childHandle.kind === 'file') && childHandle.name.endsWith('.yml')) {
            mainFilePath = childHandle.name;
            break;
          }
        }
      }

      case 'file': {
        mainFilePath = handle.name;
      }
    }

    if (!mainFilePath) {
      return null;
    }

    let newDraftEntry: DraftEntry = {
      id: crypto.randomUUID(),
      name: null,

      location: {
        type: 'user-filesystem',
        handle,
        mainFilePath
      }
    };

    this.#draftIds.add(newDraftEntry.id);

    await idb.update<MainEntry>('main', (mainEntry) => ({
      ...mainEntry!,
      draftIds: Array.from(this.#draftIds)
    }), this.#store);

    await idb.set(newDraftEntry.id, newDraftEntry, this.#store);

    let draftItem = new BrowserAppBackendDraftItem(newDraftEntry, this);
    await draftItem._initialize();

    return draftItem;
  }

  async setDraft(draftEntry: DraftEntry, primitive: DraftPrimitive) {
    let draftEntryUpdate: Partial<DraftEntry> | null = null;
    let revision: number | null = null;

    if (primitive.name !== void 0) {
      draftEntryUpdate = { ...(draftEntryUpdate ?? {}), name: primitive.name };
    }

    if (primitive.source !== void 0) {
      switch (draftEntry.location.type) {
        case 'app': {
          revision = Date.now();

          draftEntryUpdate = {
            ...(draftEntryUpdate ?? {}),
            location: {
              ...draftEntry.location,
              lastModified: revision,
              source: primitive.source
            }
          }

          break;
        }

        case 'user-filesystem': {
          let location = draftEntry.location;

          let handle = await (() => {
            switch (location.handle.kind) {
              case 'directory': return location.handle.getFileHandle(location.mainFilePath);
              case 'file': return location.handle;
            }
          })();

          let writable = await handle.createWritable();

          await writable.write(primitive.source);
          await writable.close();

          let file = await handle.getFile();
          revision = file.lastModified;

          break;
        }
      }
    }

    if (draftEntryUpdate) {
      await idb.update<DraftEntry>(draftEntry.id, (draftEntry) => ({ ...draftEntry!, ...draftEntryUpdate! }), this.#store);
    }

    return revision;
  }
}


export class BrowserAppBackendDraftItem implements DraftItem {
  lastModified!: number | null;
  pool = new util.Pool();
  readable!: boolean;
  readonly = false;
  revision = 0;
  source!: string | null;
  volumeInfo = null;
  writable!: boolean;

  _backend: BrowserAppBackend;
  _entry: DraftEntry; // Not kept up to date
  _watchHandler: (() => Promise<void>) | null = null;
  _writingCounter = 0;

  constructor(draftEntry: DraftEntry, backend: BrowserAppBackend) {
    this._backend = backend;
    this._entry = draftEntry;
  }

  async _initialize() {
    let location = this._entry.location;

    this.readable = (location.type !== 'user-filesystem')
      || ((await location.handle.queryPermission({ mode: 'read' })) === 'granted');
    this.writable = (location.type !== 'user-filesystem')
      || ((await location.handle.queryPermission({ mode: 'readwrite' })) === 'granted');

    this.source = null;

    if (this.readable) {
      this.lastModified = await (async () => {
        switch (location.type) {
          case 'app': return location.lastModified;
          case 'private-filesystem': return (await (await location.handle.getFileHandle('/index')).getFile()).lastModified;
          case 'user-filesystem': {
            let handle: FileSystemFileHandle;

            switch (location.handle.kind) {
              case 'directory':
                handle = await location.handle.getFileHandle(location.mainFilePath);
                break;
              case 'file':
                handle = location.handle;
                break;
            }

            return (await handle.getFile()).lastModified;
          }
        }
      })();
    } else {
      this.lastModified = null;
    }
  }

  get id() {
    return this._entry.id;
  }

  get kind() {
    return (this._entry.location.type === 'user-filesystem')
      ? 'ref'
      : 'own';
  }

  get locationInfo() {
    let location = this._entry.location;

    switch (location.type) {
      case 'app': return null;
      case 'private-filesystem': return {
        type: ('directory' as 'directory'),
        name: location.handle.name + ' (internal)'
      };
      case 'user-filesystem': return {
        type: location.handle.kind,
        name: location.handle.name
      };
    }
  }

  get mainFilePath() {
    switch (this._entry.location.type) {
      case 'app': return '/';
      case 'private-filesystem': return '/index';
      case 'user-filesystem': return this._entry.location.mainFilePath;
    }
  }

  get name() {
    return this._entry.name; // Not kept up to date
  }

  // Deprecated
  async getFiles() {
    let location = this._entry.location;

    switch (location.type) {
      case 'app': {
        return {
          '/': new Blob([location.source], { type: 'text/yaml' })
        };
      }

      case 'private-filesystem':
      case 'user-filesystem': {
        switch (location.handle.kind) {
          case 'directory': {
            let files: Record<string, Blob> = {};

            for await (let entry of location.handle.values()) {
              if (entry.kind === 'file') {
                let file = await entry.getFile();
                files[entry.name] = file;
              }
            }

            return files;
          }

          case 'file': {
            return { [this.mainFilePath]: await location.handle.getFile() };
          }
        }
      }
    }
  }

  async request() {
    if (this._entry.location.type === 'user-filesystem') {
      try {
        if (this.readonly) {
          this.readable = ((await this._entry.location.handle.requestPermission({ mode: 'read' })) === 'granted');
        } else {
          this.writable = ((await this._entry.location.handle.requestPermission({ mode: 'readwrite' })) === 'granted');
          this.readable = this.writable;
        }
      } catch (err) {
        if ((err as { name: string; }).name === 'SecurityError') {
          return;
        }

        throw err;
      }

      await this._watchHandler?.();
    }
  }

  async watch(handler: () => void, options: { signal: AbortSignal; }) {
    let intervalId: number | null = null;
    let updateWatchListener = async () => {
      let location = this._entry.location;

      if ((location.type === 'user-filesystem') && (location.handle.kind === 'file')) {
        let handle = location.handle;

        if (this.readable && (intervalId === null)) {
          let file = await handle.getFile();

          this.lastModified = file.lastModified;
          this.revision = file.lastModified;
          this.source = await file.text();

          if (!options.signal.aborted) {
            intervalId = setInterval(() => {
              if (this._writingCounter < 1) {
                this.pool.add(async () => {
                  let file = await handle.getFile();

                  if (file.lastModified !== this.lastModified) {
                    this.lastModified = file.lastModified;
                    this.revision = file.lastModified;
                    this.source = await file.text();

                    handler();
                  }
                });
              }
            }, 1000);
          }
        }
      }
    };

    this._watchHandler = async () => {
      await updateWatchListener();
      handler();
    };

    options?.signal.addEventListener('abort', () => {
      this._watchHandler = null;

      if (intervalId !== null) {
        clearInterval(intervalId);
      }
    });

    await updateWatchListener();
    handler();
  }

  async write(primitive: DraftPrimitive) {
    this._writingCounter += 1;

    let revision = await this._backend.setDraft(this._entry, primitive);
    this._writingCounter -= 1;

    if (revision !== null) {
      this.lastModified = revision;
      this.source = primitive.source!;
    }
  }
}
