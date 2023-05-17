import { OrdinaryId } from 'pr1-shared';
import { useCallback, useSyncExternalStore } from 'react';

import { Pool } from '../util';
import { Store } from './base';
import { StoreEntries, StoreEntryKey, StoreManagerHookFromEntries } from './types';


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

    for (let [rawKey, value] of defaultValues) {
      let key = JSON.stringify(transformEntryKey(rawKey));

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

  useEntry = ((rawKey: StoreEntryKey) => {
    let key = JSON.stringify(transformEntryKey(rawKey));

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


export function concatStoreEntryKeys<Prefix extends readonly OrdinaryId[], Key extends StoreEntryKey>(prefix: Prefix, key: Key) {
  return [...prefix, ...(Array.isArray(key) ? key : [key])] as (Key extends OrdinaryId[] ? [...Prefix, ...Key] : [...Prefix, Key]);
}

export function transformEntryKey(key: StoreEntryKey): OrdinaryId[] {
  return Array.isArray(key) ? key : [key];
}
