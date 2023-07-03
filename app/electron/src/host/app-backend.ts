import { AppBackend, AppBackendSnapshot, DocumentId, DocumentInstanceSnapshot, DocumentSlot, DocumentSlotSnapshot, DocumentSlotStatus, DraftInstance, DraftInstanceId, DraftInstanceSnapshot, MemoryStore, SnapshotProvider, Store, deserialize, serialize } from 'pr1';
import { DraftEntryId } from 'pr1-library';

import { DraftSkeleton } from '../interfaces';
import './navigation';


export class ElectronAppBackend extends SnapshotProvider<AppBackendSnapshot> implements AppBackend {
  _drafts: Record<DraftInstanceId, DraftInstance> = {};

  protected override _createSnapshot(): AppBackendSnapshot {
    return {
      drafts: Object.fromEntries(
        Object.values(this._drafts).map((draftInstance) => [draftInstance.id, draftInstance.getSnapshot()])
      )
    };
  }

  async initialize() {
    let draftSkeletons = await window.api.drafts.list();

    this._drafts = Object.fromEntries(
      draftSkeletons.map((skeleton) => {
        let instance = new ElectronAppDraftInstance(this, skeleton);
        return [instance.id, instance];
      })
    );

    this._update();
  }

  createStore(name: string, options: { type: 'persistent' | 'session'; }) {
    switch (options.type) {
      case 'persistent':
        return new ElectronAppStore(name);
      case 'session':
        return new MemoryStore();
    }
  }


  async createDraft(contents: string) {
    let skeleton = await window.api.drafts.create(contents);

    if (skeleton) {
      let instance = new ElectronAppDraftInstance(this, skeleton);

      this._drafts[instance.id] = instance;
      this._update();

      return instance;
    }

    return null;
  }

  async queryDraft() {
    let skeleton = await window.api.drafts.query();

    if (skeleton) {
      let instance = new ElectronAppDraftInstance(this, skeleton);

      this._drafts[instance.id] = instance;
      this._update();

      return instance;
    }

    return null;
  }
}


export class ElectronAppDraftInstance extends SnapshotProvider<DraftInstanceSnapshot> implements DraftInstance {
  id: DraftInstanceId;

  private _entryPath: string;
  private _name: string | null;

  constructor(private _appBackend: ElectronAppBackend, skeleton: DraftSkeleton) {
    super();

    this.id = skeleton.id as string as DraftInstanceId;
    this._entryPath = skeleton.entryPath;
    this._name = skeleton.name;
  }

  private get _draftEntryId() {
    return this.id as string as DraftEntryId;
  }

  protected override _createSnapshot(): DraftInstanceSnapshot {
    return {
      model: this,

      id: this.id,
      name: this._name
    };
  }

  getEntryDocumentSlot() {
    return new ElectronAppDocumentSlot(this._entryPath);
  }

  async remove() {
    await window.api.drafts.delete(this._draftEntryId);
    delete this._appBackend._drafts[this.id];
    this._appBackend._update();
  }

  async setName(name: string) {
    this._name = name;

    this._update();
    this._appBackend._update();

    await window.api.drafts.setName(this._draftEntryId, name);
  }
}

export class ElectronAppDocumentSlot extends SnapshotProvider<DocumentSlotSnapshot> implements DocumentSlot {
  id: DocumentId;

  private _instance: DocumentInstanceSnapshot | null = null;
  private _status: DocumentSlotStatus = 'unwatched';

  constructor(private _path: string) {
    super();

    this.id = this._path as DocumentId;
  }

  protected override _createSnapshot(): DocumentSlotSnapshot {
    return {
      model: this,

      id: this.id,
      instance: this._instance && {
        ...this._instance
      },
      path: this._path.split((window.api.platform === 'win32') ? '\\' : '/'),
      status: this._status
    };
  }

  async open() {
    await window.api.drafts.openFile(this._path);
  }

  async reveal() {
    await window.api.drafts.revealFile(this._path);
  }

  async watch(options: { signal: AbortSignal; }) {
    this._status = 'loading';

    window.api.drafts.watch(this._path, (change) => {
      this._status = change.status;
      this._instance = change.instance && {
        ...this._instance,
        contents: change.instance.contents!,
        lastExternalModificationDate: change.instance.lastExternalModificationDate,
        lastModificationDate: change.instance.lastModificationDate,
        possiblyWritable: true,
        writable: true
      };

      this._update();
    }, (callback) => {
      options.signal.addEventListener('abort', () => void callback());
    });
  }

  async write(contents: string) {
    await window.api.drafts.write(this._path, contents);
  }
}


export class ElectronAppStore implements Store {
  constructor(private _name: string) {

  }

  async read(key: string) {
    let value = await window.api.store.read(this._name, key);

    return (value !== undefined)
      ? deserialize(value)
      : undefined;
  }

  async * readAll() {
    for (let [key, value] of await window.api.store.readAll(this._name)) {
      yield [key, deserialize(value)] as const;
    }
  }

  async write(key: string, value: unknown) {
    await window.api.store.write(this._name, key, serialize(value));
  }
}
