import { ExperimentId, PluginName } from 'pr1-shared';
import { Application } from './application';
import { Host } from './host';
import { PluginContext } from './interfaces/plugin';
import { StoreConsumer, StoreEntries } from './store/types';


export function createPluginContext<PersistentStoreEntries extends StoreEntries, SessionStoreEntries extends StoreEntries>(app: Application, host: Host, namespace: PluginName): PluginContext<PersistentStoreEntries, SessionStoreEntries> {
  return {
    app,
    host: host,
    pool: app.pool,
    async requestToExecutor(request) {
      return await host.client.request({
        type: 'requestToExecutor',
        data: request,
        namespace
      });
    },
    async requestToRunner(request, experimentId: ExperimentId) {
      return await host.client.request({
        type: 'requestToRunner',
        experimentId,
        data: request,
        namespace
      });
    },
    store: {
      usePersistent: app.pluginStores[namespace]?.persistent.useEntry,
      useSession: app.pluginStores[namespace]?.session.useEntry
    } as StoreConsumer<PersistentStoreEntries, SessionStoreEntries>
  };
}
