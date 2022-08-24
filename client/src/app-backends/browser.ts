import * as idb from 'idb-keyval';

import { Draft, DraftId, DraftPrimitive } from '../draft';
import { AppBackend, DraftItem, DraftsUpdateEvent, DraftsUpdateListener } from './base';
import * as util from '../util';
import { HostId } from '../backends/common';
import type { Host, HostSettings, HostSettingsRecord } from '../host';


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
    type: 'user-filesystem';
    handle: FileSystemDirectoryHandle; // | FileSystemFileHandle;
    mainFilePath: string;
  // } | {
  //   type: 'private-filesystem';
  //   handle: FileSystemDirectoryHandle;
  };
}

interface HostSettingsEntry {
  defaultHostSettingsId: HostId | null;
  hosts: Record<HostId, HostSettings>;
}


export class BrowserAppBackend implements AppBackend {
  static version = 1;

  #draftIds = new Set<DraftId>();
  #draftListeners = new Set<DraftsUpdateListener>();
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

    if (mainEntry && (mainEntry.version === BrowserAppBackend.version)) {
      let draftEntries = await idb.getMany<DraftEntry>(mainEntry.draftIds, this.#store);
      let draftItems = Object.fromEntries(
        draftEntries.map((draftEntry) => {
          return [draftEntry.id, createDraftItem(draftEntry)];
        })
      );

      this.#draftIds = new Set(mainEntry.draftIds);
      this._triggerDraftsUpdate({ options: { skipCompilation: false }, update: draftItems });
    } else {
      let entry: MainEntry = {
        draftIds: [],
        version: BrowserAppBackend.version
      };

      await idb.set('main', entry, this.#store);
    }
  }

  async notify(message: string) {
    if (Notification.permission === 'granted') {
      new Notification(message);
    }
  }

  async createDraft(source: string) {
    let handle = await util.wrapAbortable(window.showDirectoryPicker());

    if (!handle) {
      return null;
    }

    let newDraftEntry = {
      id: crypto.randomUUID(),
      name: null,

      location: {
        type: ('user-filesystem' as 'user-filesystem'),
        handle,
        mainFilePath: 'protocol.yml'
      }
    };

    let fileHandle = await handle.getFileHandle(newDraftEntry.location.mainFilePath, { create: true });
    let writable = await fileHandle.createWritable();

    await writable.write(source);
    await writable.close();

    await idb.update<MainEntry>('main', (mainEntry) => ({
      ...mainEntry!,
      draftIds: [...this.#draftIds, newDraftEntry.id]
    }), this.#store);

    await idb.set(newDraftEntry.id, newDraftEntry, this.#store);
    this._triggerDraftsUpdate({ options: { skipCompilation: false }, update: { [newDraftEntry.id]: createDraftItem(newDraftEntry) } });

    return newDraftEntry.id;
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

    this._triggerDraftsUpdate({ options: { skipCompilation: false }, update: { [draftId]: undefined } });
  }

  async loadDraft(): Promise<DraftId | null> {
    let handle = await util.wrapAbortable(window.showDirectoryPicker());

    if (!handle) {
      return null;
    }

    let files: Record<string, Blob> = {};

    for await (let entry of handle.values()) {
      if (entry.kind === 'file') {
        let file = await entry.getFile();

        files[entry.name] = file;
      }
    }

    let mainFilePath = Object.keys(files).find((path) => path.endsWith('.yml')) ?? null;

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

    await idb.update<MainEntry>('main', (mainEntry) => ({
      ...mainEntry!,
      draftIds: [...this.#draftIds, newDraftEntry.id]
    }), this.#store);

    await idb.set(newDraftEntry.id, newDraftEntry, this.#store);
    this._triggerDraftsUpdate({ options: { skipCompilation: true }, update: { [newDraftEntry.id]: createDraftItem(newDraftEntry) } });

    return newDraftEntry.id;
  }

  async setDraft(draftId: DraftId, primitive: DraftPrimitive, options?: { skipCompilation?: unknown; }) {
    let draftEntry = (await idb.get<DraftEntry>(draftId, this.#store))!;

    let updatedDraftEntry = {
      ...draftEntry,
      lastModified: Date.now()
    };

    if (primitive.name !== void 0) {
      updatedDraftEntry.name = primitive.name;
    }

    if (primitive.source !== void 0) {
      switch (updatedDraftEntry.location.type) {
        case 'app': {
          updatedDraftEntry.location.source = primitive.source;
          break;
        }

        case 'user-filesystem': {
          let handle = await updatedDraftEntry.location.handle.getFileHandle('protocol.yml');
          let writable = await handle.createWritable();

          await writable.write(primitive.source);
          await writable.close();

          break;
        }
      }
    }

    await idb.set(draftId, updatedDraftEntry, this.#store);

    this._triggerDraftsUpdate({
      options: { skipCompilation: !!options?.skipCompilation },
      update: { [draftId]: createDraftItem(updatedDraftEntry) }
    });
  }

  onDraftsUpdate(listener: DraftsUpdateListener, options?: { signal?: AbortSignal | undefined; }) {
    this.#draftListeners.add(listener);

    options?.signal?.addEventListener('abort', () => {
      this.#draftListeners.delete(listener);
    });
  }

  private _triggerDraftsUpdate(event: DraftsUpdateEvent) {
    for (let listener of this.#draftListeners) {
      listener(event);
    }
  }
}


function createDraftItem(draftEntry: DraftEntry): DraftItem {
  return {
    id: draftEntry.id,
    name: draftEntry.name,
    kind: (draftEntry.location.type === 'user-filesystem') ? 'ref' : 'own',
    lastModified: null,
    getFiles: async () => {
      switch (draftEntry.location.type) {
        case 'app': {
          return {
            '/main.yml': new Blob([draftEntry.location.source], { type: 'text/yaml' })
          };
        }

        case 'user-filesystem': {
          let files: Record<string, Blob> = {};
          let handle = draftEntry.location.handle;

          if ((await handle.queryPermission()) !== 'granted') {
            try {
              if ((await handle.requestPermission()) !== 'granted') {
                return null;
              };
            } catch (err) {
              if ((err as { name: string; }).name === 'SecurityError') {
                return null;
              }

              throw err;
            }
          }

          for await (let entry of draftEntry.location.handle.values()) {
            if (entry.kind === 'file') {
              let file = await entry.getFile();

              files[entry.name] = file;
            }
          }

          return files;
        }
      }
    },
    async getMainFile() {
      let files = await this.getFiles();

      if (!files) {
        return null;
      }

      return files[this.mainFilePath];
    },
    get mainFilePath() {
      switch (draftEntry.location.type) {
        case 'app': return '';
        case 'user-filesystem': return draftEntry.location.mainFilePath;
      }
    },
    get locationInfo() {
      switch (draftEntry.location.type) {
        case 'app': return null;
        case 'user-filesystem': {
          return {
            type: ('directory' as 'directory'),
            name: draftEntry.location.handle.name
          };
        }
      }
    }
  };
}
