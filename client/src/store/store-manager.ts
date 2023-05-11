import { useCallback, useSyncExternalStore } from 'react';
import { Pool } from '../util';
import { Store } from './base';
import { OrdinaryId } from '../interfaces/util';


export interface StoreManagerEntryInfo {
  listeners: Set<(() => void)>;
  value: unknown;
}

export type StoreManagerHook = <T>(key: OrdinaryId[], defaultValue?: T | (() => T)) => readonly [T, (newValue: T) => void];
export type SpecializedStoreManagerHook<K, V> = (key: K, defaultValue?: V | (() => V)) => readonly [V, (newValue: V) => void];

export class StoreManager {
  private entryInfos = new Map<string, StoreManagerEntryInfo>();
  private pool = new Pool();

  constructor(private store: Store) {

  }

  async initialize() {
    for await (let [key, value] of this.store.readAll()) {
      this.entryInfos.set(key, {
        listeners: new Set(),
        value
      });
    }
  }

  initializeEntry(rawKey: OrdinaryId[], value: unknown) {
    let key = JSON.stringify(rawKey);

    if (!this.entryInfos.has(key)) {
      this.writeEntry(key, value);
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

  useEntry: StoreManagerHook = <T>(rawKey: OrdinaryId[], defaultValue?: T | (() => T)) => {
    let key = JSON.stringify(rawKey);

    let value = useSyncExternalStore<T>(useCallback((listener) => {
      let entryInfo = this.entryInfos.get(key)!;
      entryInfo.listeners.add(listener);

      return () => {
        entryInfo.listeners.delete(listener);
      };
    }, [key]), () => {
      if (!this.entryInfos.has(key)) {
        if (defaultValue === undefined) {
          throw new Error('Missing default value');
        }

        let initialValue = (typeof defaultValue === 'function')
          ? (defaultValue as (() => T))()
          : defaultValue;

        this.writeEntry(key, initialValue);
      }

      return this.entryInfos.get(key)!.value as T;
    });

    return [
      value,
      (newValue: T) => {
        this.writeEntry(key, newValue);
      }
    ] as const;
  }
}
