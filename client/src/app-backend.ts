import * as idb from 'idb-keyval';

import { Draft, DraftId } from './draft';


export interface MainEntry {
  draftIds: DraftId[];
  version: number;
}

export interface DraftEntry {
  id: DraftId;
  name: string | null;
  lastModified: number;

  location: {
    type: 'app';
    source: string;
  } | {
    type: 'filesystem';
    handle: FileSystemFileHandle;
  };
}

export type DraftsUpdateRecord = Record<DraftId, DraftEntry | undefined>;


export interface AppBackendOptions {
  onDraftsUpdate(update: DraftsUpdateRecord, options: any): void;
}

export class AppBackend {
  static readonly version = 1;

  #draftIds = new Set<DraftId>();
  #options: AppBackendOptions;
  #store = idb.createStore('pr1', 'data');

  constructor(options: AppBackendOptions) {
    this.#options = options;
  }

  async initialize() {
    let mainEntry = await idb.get<MainEntry>('main', this.#store);

    if (mainEntry && (mainEntry.version === AppBackend.version)) {
      let drafts = await idb.getMany(mainEntry.draftIds, this.#store);
      let draftsById = Object.fromEntries(
        drafts.map((draft) => [draft.id, draft])
      );

      this.#draftIds = new Set(mainEntry.draftIds);
      this.#options.onDraftsUpdate(draftsById, {});
    } else {
      let entry: MainEntry = {
        draftIds: [],
        version: AppBackend.version
      };

      await idb.set('main', entry, this.#store);
    }
  }

  async deleteDraft(draftId: DraftId) {
    this.#draftIds.delete(draftId);

    await idb.update<MainEntry>('main', (mainEntry) => ({
      ...mainEntry!,
      draftIds: [...this.#draftIds]
    }), this.#store);

    await idb.del(draftId, this.#store);

    this.#options.onDraftsUpdate({ [draftId]: undefined }, {});
  }

  async setDraft(draftEntryUpdate: Pick<DraftEntry, 'id'> & Partial<DraftEntry>, options: any = {}) {
    let isNewDraft = !this.#draftIds.has(draftEntryUpdate.id);

    let draftEntry = await idb.get(draftEntryUpdate.id, this.#store);
    let newDraftEntry = {
      ...draftEntry,
      ...draftEntryUpdate
    };

    await idb.set(draftEntryUpdate.id, newDraftEntry, this.#store);

    if (isNewDraft) {
      this.#draftIds.add(draftEntryUpdate.id);

      await idb.update<MainEntry>('main', (mainEntry) => ({
        ...mainEntry!,
        draftIds: [...this.#draftIds]
      }), this.#store);
    }

    this.#options.onDraftsUpdate({ [draftEntryUpdate.id]: newDraftEntry }, options);
  }
}
