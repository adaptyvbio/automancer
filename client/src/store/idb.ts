import { createStore, entries, get, set } from 'idb-keyval';
import { Store } from './base';


export class IDBStore implements Store {
  private store: ReturnType<typeof createStore>;

  constructor(options: {
    dbName: string;
    storeName: string;
  } = {
    dbName: 'pr1',
    storeName: 'settings'
  }) {
    this.store = createStore(options.dbName, options.storeName);
  }

  async read(key: string) {
    return await get(key, this.store);
  }

  async * readAll() {
    for (let [key, value] of await entries(this.store)) {
      yield [key as string, value] as const;
    }
  }

  async write(key: string, value: unknown) {
    await set(key, value, this.store);
  }
}
