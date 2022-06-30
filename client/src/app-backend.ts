import * as idb from 'idb-keyval';

import { Draft, DraftId, DraftsUpdateRecord } from './draft';


export interface MainRecord {
  draftIds: DraftId[];
  version: number;
}

export interface AppBackendOptions {
  onDraftsUpdate(update: DraftsUpdateRecord): void;
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
    let mainRecord = await idb.get<MainRecord>('main', this.#store);

    if (mainRecord && (mainRecord.version === AppBackend.version)) {
      let drafts = await idb.getMany(mainRecord.draftIds, this.#store);
      let draftsById = Object.fromEntries(
        drafts.map((draft) => [draft.id, draft])
      );

      this.#draftIds = new Set(mainRecord.draftIds);
      this.#options.onDraftsUpdate(draftsById);
    } else {
      let record: MainRecord = {
        draftIds: [],
        version: AppBackend.version
      };

      await idb.set('main', record, this.#store);
    }
  }

  async deleteDraft(draftId: DraftId) {
    this.#draftIds.delete(draftId);

    await idb.update<MainRecord>('main', (mainRecord) => ({
      ...mainRecord!,
      draftIds: [...this.#draftIds]
    }), this.#store);

    await idb.del(draftId, this.#store);

    this.#options.onDraftsUpdate({ [draftId]: undefined });
  }

  async setDraft(draft: Draft) {
    if (draft.location.type === 'memory') {
      let isNewDraft = !this.#draftIds.has(draft.id);

      await idb.set(draft.id, draft, this.#store);

      if (isNewDraft) {
        this.#draftIds.add(draft.id);

        await idb.update<MainRecord>('main', (mainRecord) => ({
          ...mainRecord!,
          draftIds: [...this.#draftIds]
        }), this.#store);
      }

      this.#options.onDraftsUpdate({ [draft.id]: draft });
    }
  }
}
