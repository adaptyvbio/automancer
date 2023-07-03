import { useCallback, useSyncExternalStore } from 'react';

import { Pool } from '../util';
import { Store } from './base';
import { StoreEntries, StoreManagerHookFromEntries, StoreManagerReadFromEntries } from './types';


export interface StoreManagerEntryInfo {
  listeners: Set<(() => void)>;
  value: unknown;
}

export type SpecializedStoreManagerHook<K, V> = (key: K) => readonly [V, (newValue: V) => void];

export class StoreManager<Entries extends StoreEntries> {
  private entryInfos = new Map<string, StoreManagerEntryInfo>();
  private pool = new Pool();

  constructor(private store: Store) {

  }

  async initialize(defaultValues: Entries) {
    for await (let [key, value] of this.store.readAll()) {
      this.entryInfos.set(key, {
        listeners: new Set(),
        value
      });
    }

    for (let [key, value] of Object.entries(defaultValues)) {
      if (!this.entryInfos.has(key)) {
        this.writeEntry(key, value);
      }
    }
  }

  private writeEntry(key: string, value: unknown) {
    this.pool.add(() => this.store.write(key, value));

    let entryInfo = this.entryInfos.get(key);

    if (entryInfo) {
      entryInfo.value = value;
    } else {
      entryInfo = {
        listeners: new Set(),
        value
      };

      this.entryInfos.set(key, entryInfo);
    }

    for (let listener of entryInfo.listeners) {
      listener();
    }
  }

  get = ((key: string) => {
    return this.entryInfos.get(key)!.value;
  }) as StoreManagerReadFromEntries<Entries>;

  useEntry = ((key: string) => {
    let value = useSyncExternalStore<unknown>(useCallback((listener) => {
      let entryInfo = this.entryInfos.get(key)!;
      entryInfo.listeners.add(listener);

      return () => {
        entryInfo.listeners.delete(listener);
      };
    }, [key]), () => {
      return this.entryInfos.get(key)!.value;
    });

    return [
      value,
      (newValue: unknown) => {
        this.writeEntry(key, newValue);
      }
    ] as const;
  }) as StoreManagerHookFromEntries<Entries>
}
