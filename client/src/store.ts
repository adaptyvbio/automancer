import { useState } from "react";

export interface SyncObjectStore<T> {
  load(): ({ ok: true; value: T } | { ok: false; });
  save(value: T): void;
}

export function createSyncSessionStorageStore<T>(key: string): SyncObjectStore<T> {
  return {
    load() {
      let rawValue = sessionStorage[key];

      return rawValue !== undefined
        ? {
          ok: true,
          value: JSON.parse(rawValue) as T
        }
        : {
          ok: false
        };
    },
    save(value) {
      sessionStorage[key] = JSON.stringify(value);
    }
  };
}

export function useSyncObjectStore<T, S>(defaultValue: T, store?: SyncObjectStore<S> | null, options?: {
  deserialize(serializedValue: S): T;
  serialize(value: T): S;
}) {
  let save = (newValue: T) => {
    store?.save(
      options
        ? options.serialize(newValue)
        : (newValue as unknown as S)
    );
  };

  let [value, setValue] = useState(() => {
    if (!store) {
      return defaultValue;
    }

    let loadResult = store.load();

    if (!loadResult.ok) {
      save(defaultValue);
      return defaultValue;
    }

    return options
      ? options.deserialize(loadResult.value)
      : (loadResult.value as unknown as T);
  });

  return [
    value,
    (newValue: T) => {
      save(newValue);
      setValue(newValue);
    }
  ] as const;
}
