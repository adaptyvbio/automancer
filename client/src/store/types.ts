import { UnionToIntersection } from 'pr1-shared';

import { SpecializedStoreManagerHook } from './store-manager';


export type StoreEntries = object;

export interface StoreConsumer<PersistentStoreEntries extends StoreEntries, SessionStoreEntries extends StoreEntries> {
  usePersistent: StoreManagerHookFromEntries<PersistentStoreEntries>;
  useSession: StoreManagerHookFromEntries<SessionStoreEntries>;
}

export type StoreManagerHookFromEntries<T extends StoreEntries> = UnionToIntersection<{
  [S in keyof T]: SpecializedStoreManagerHook<S, T[S]>;
}[keyof T]>;
