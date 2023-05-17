import { PluginName } from 'pr1-shared';
import { Application } from './application';
import { Host } from './host';
import { PluginContext } from './interfaces/plugin';
import { StoreConsumer, StoreEntries, StoreEntryKey } from './store/types';
import { concatStoreEntryKeys } from './store/store-manager';


export function createPluginContext<PersistentStoreEntries extends StoreEntries, SessionStoreEntries extends StoreEntries>(app: Application, host: Host, namespace: PluginName): PluginContext<PersistentStoreEntries, SessionStoreEntries> {
  return {
    host: host,
    pool: app.pool,
    store: {
      usePersistent: (key: StoreEntryKey) =>
        app.store.usePersistent(concatStoreEntryKeys(['plugin', namespace] as const, key)),
      useSession: (key: StoreEntryKey) =>
        app.store.useSession(['plugin', namespace, ...(Array.isArray(key) ? key : [key])])
    } as StoreConsumer<PersistentStoreEntries, SessionStoreEntries>
  };
}
