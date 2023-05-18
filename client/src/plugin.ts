import { PluginName } from 'pr1-shared';
import { Application } from './application';
import { Host } from './host';
import { PluginContext } from './interfaces/plugin';
import { StoreConsumer, StoreEntries } from './store/types';


export function createPluginContext<PersistentStoreEntries extends StoreEntries, SessionStoreEntries extends StoreEntries>(app: Application, host: Host, namespace: PluginName): PluginContext<PersistentStoreEntries, SessionStoreEntries> {
  return {
    app,
    host: host,
    pool: app.pool,
    store: {
      usePersistent: app.pluginStores[namespace]?.persistent.useEntry,
      useSession: app.pluginStores[namespace]?.session.useEntry
    } as StoreConsumer<PersistentStoreEntries, SessionStoreEntries>
  };
}
