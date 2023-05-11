import { useState } from 'react';

import { deserialize, serialize } from './serialize-immutable';


export interface SyncObjectStore<T> {
  load(): ({ ok: true; value: T } | { ok: false; });
  save(value: T): void;
}

export const createSyncPersistentStorageStore = createSyncSessionStorageStore;

export function createSyncSessionStorageStore<T>(key: string): SyncObjectStore<T> {
  return {
    load() {
      let rawValue = sessionStorage[key];

      return rawValue !== undefined
        ? {
          ok: true,
          value: deserialize(JSON.parse(rawValue)) as T
        }
        : {
          ok: false
        };
    },
    save(value) {
      sessionStorage[key] = JSON.stringify(serialize(value));
    }
  };
}

export function useSyncObjectStore<T>(defaultValue: T, store?: SyncObjectStore<T> | null) {
  let [value, setValue] = useState(() => {
    if (!store) {
      return defaultValue;
    }

    let loadResult = store.load();

    if (!loadResult.ok) {
      store?.save(defaultValue);
      return defaultValue;
    }

    return loadResult.value;
  });

  return [
    value,
    (newValue: T) => {
      store?.save(newValue);
      setValue(newValue);
    }
  ] as const;
}
