import { createStore, entries, get, set } from 'idb-keyval';

import { Store } from './base';
import { deserialize, serialize } from '../serialize-immutable';


export class IDBStore implements Store {
  private store: ReturnType<typeof createStore>;

  constructor(options: {
    dbName: string;
    storeName: string;
  } = {
    dbName: 'pr1-store',
    storeName: 'store'
  }) {
    this.store = createStore(options.dbName, options.storeName);
  }

  async read(key: string) {
    return deserialize(await get(key, this.store));
  }

  async * readAll() {
    for (let [key, value] of await entries(this.store)) {
      yield [key as string, deserialize(value)] as const;
    }
  }

  async write(key: string, value: unknown) {
    await set(key, serialize(value), this.store);
  }
}
