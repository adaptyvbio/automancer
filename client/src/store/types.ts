import { OrdinaryId, UnionToIntersection } from 'pr1-shared';
import { SpecializedStoreManagerHook } from './store-manager';


export type StoreEntryKey = OrdinaryId[] | string;
export type StoreEntries = [StoreEntryKey, unknown][];

export interface StoreConsumer<PersistentStoreEntries extends StoreEntries, SessionStoreEntries extends StoreEntries> {
  usePersistent: StoreManagerHookFromEntries<PersistentStoreEntries>;
  useSession: StoreManagerHookFromEntries<SessionStoreEntries>;
}

export type StoreManagerHookFromEntries<T extends StoreEntries> = UnionToIntersection<{
  [S in keyof T]: T[S] extends [(infer K) & StoreEntryKey, infer V] ? SpecializedStoreManagerHook<K, V> : never;
}[(keyof T) & number]>;
