import { Set as ImSet } from 'immutable';
import { Client, OrdinaryId, PluginName } from 'pr1-shared';
import * as React from 'react';

import styles from '../styles/components/application.module.scss';

import type { AppBackend } from './app-backends/base';
import { Sidebar } from './components/sidebar';
import { createDraftFromItem, Draft, DraftCompilation, DraftId, DraftsRecord } from './draft';
import type { Host } from './host';
import { ViewChip } from './views/chip';
import { ViewChips } from './views/chips';
import { ViewDesign } from './views/test/design';
import { ViewDraftWrapper } from './views/draft';
import { ViewExecution } from './views/execution';
import { ViewDrafts } from './views/protocols';
import { ViewConf } from './views/conf';
import { Pool } from './util';
import { HostInfo } from './interfaces/host';
import { BaseUrl, BaseUrlPathname } from './constants';
import { UnsavedDataCallback, ViewRouteMatch, ViewType } from './interfaces/view';
import { ErrorBoundary } from './components/error-boundary';
import { ViewPluginView } from './views/plugin-view';
import { concatStoreEntryKeys, StoreManager } from './store/store-manager';
import { ApplicationStoreConsumer, ApplicationPersistentStoreDefaults, ApplicationPersistentStoreEntries, ApplicationSessionStoreEntries, ApplicationSessionStoreDefaults } from './store/application';
import { ApplicationStoreContext } from './contexts';
import { Plugins, UnknownPlugin } from './interfaces/plugin';


const Views: ViewType[] = [ViewChip, ViewChips, ViewConf, ViewDesign, ViewDraftWrapper, ViewDrafts, ViewExecution, ViewPluginView];

const Routes: Route[] = Views.flatMap((View) =>
  View.routes.map((route) => ({
    component: View,
    id: route.id,
    pattern: new URLPattern({
      baseURL: BaseUrl,
      pathname: BaseUrlPathname + route.pattern
    })
  }))
);


export interface Route {
  component: ViewType;
  id: string;
  pattern: URLPattern;
}

// export interface RouteResolution {
//   match: any;
//   route: Route;
// }

export interface RouteData {
  params: any;
  route: Route;
}

function createViewRouteMatchFromRouteData(routeData: RouteData): ViewRouteMatch {
  return {
    id: routeData.route.id,
    params: routeData.params
  };
}


export interface ApplicationProps {
  appBackend: AppBackend;
  client: Client;
  hostInfo: HostInfo;

  onHostStarted?(): void;
  setStartup?(): void;
}

export interface ApplicationState {
  host: Host | null;

  drafts: DraftsRecord;
  openDraftIds: ImSet<DraftId>;

  currentRouteData: RouteData | null;
}

export class Application extends React.Component<ApplicationProps, ApplicationState> {
  controller = new AbortController();
  pool = new Pool();
  unsavedDataCallback: UnsavedDataCallback | null = null;

  persistentStoreManager: StoreManager<ApplicationPersistentStoreEntries>;
  sessionStoreManager: StoreManager<ApplicationSessionStoreEntries>;
  store: ApplicationStoreConsumer;

  constructor(props: ApplicationProps) {
    super(props);

    this.state = {
      host: null,

      drafts: {},
      openDraftIds: ImSet(),

      currentRouteData: null
    };


    this.persistentStoreManager = new StoreManager(this.appBackend.persistentStore);
    this.sessionStoreManager = new StoreManager(this.appBackend.sessionStore);

    this.store = {
      usePersistent: this.persistentStoreManager.useEntry,
      useSession: this.sessionStoreManager.useEntry
    };
  }

  get appBackend(): AppBackend {
    return this.props.appBackend;
  }

  async initializeHost() {
    let client = this.props.client;
    // let result = await client.initialize();

    // if (!result.ok) {
    //   console.error(`Backend of host failed to start with error: ${result.reason}`);
    //   return;
    // }

    console.log('Initial state ->', client.state);

    this.pool.add(() => client.start());

    client.onMessage((message) => {
      if (message.type === 'state') {
        console.log('New state ->', client.state);

        this.setState((state) => ({
          host: {
            ...state.host!,
            state: client.state!
          }
        }));
      }
    });

    let host: Host = {
      client,
      clientId: client.info!.clientId,
      plugins: (null as any),
      state: client.state!,
      staticUrl: client.info!.staticUrl,
      units: (null as any)
    };

    this.setState({ host }, () => {
      this.props.onHostStarted?.();
    });

    let plugins = await this.loadUnitClients(host);

    client.closed
      .catch((err) => {
        console.error(`Backend of host terminated with error: ${err.message ?? err}`);
        console.error(err);
      })
      .finally(() => {
        this.setState({ host: null });
      });

    return [client.state, plugins] as const;
  }

  async loadUnitClients(host: Host = this.state.host!, options?: { development?: unknown; }) {
    let targetUnitsInfo = Object.values(host.state.info.units)
      .filter((unitInfo) => unitInfo.enabled && (!options?.development || unitInfo.development));

    if (host.plugins) {
      let expiredStyleSheets = targetUnitsInfo.flatMap((unitInfo) => {
        return host.plugins[unitInfo.namespace]?.styleSheets ?? [];
      });

      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => !expiredStyleSheets.includes(sheet));
    }

    let plugins: Plugins = Object.fromEntries(
      (await Promise.all(
        targetUnitsInfo
          .filter((pluginInfo) => (pluginInfo.hasClient && host.staticUrl))
          .map(async (pluginInfo) => {
            console.log(`%cLoading unit %c${pluginInfo.namespace}%c (${pluginInfo.version})`, '', 'font-weight: bold;', '');

            try {
              let url = new URL(`./${pluginInfo.namespace}/${pluginInfo.version}/index.js?${Date.now()}`, host.staticUrl!);
              let imported = await import(url.href);

              let plugin: UnknownPlugin = imported.default ?? imported;

              return [[pluginInfo.namespace, plugin] as const];
            } catch (err) {
              console.error(`%cFailed to load unit %c${pluginInfo.namespace}%c (${pluginInfo.version})`, '', 'font-weight: bold;', '');
              console.error(err);

              return [];
            }
          })
      )).flat()
    );

    document.adoptedStyleSheets.push(...Object.values(plugins).flatMap((plugin) => plugin.styleSheets ?? []));

    this.setState((state) => ({
      host: {
        ...state.host!,
        plugins: {
          ...state.host!.plugins,
          ...plugins
        },
        units: {
          ...state.host!.units,
          ...(plugins as any)
        }
      }
    }));

    return plugins;
  }


  resolveNavigation(url: string): RouteData | null {
    for (let route of Routes) {
      let match = route.pattern.exec(url);

      if (match) {
        return {
          params: match.pathname.groups,
          route
        };
      }
    }

    return null;
  }

  handleNavigation(url: string, routeData: RouteData | null) {
    if (routeData) {
      this.setState({
        currentRouteData: routeData
      });
    } else {
      console.warn(`Missing view for pathname ${new URL(url).pathname}, redirecting to ${BaseUrlPathname}/chip`);
      navigation.navigate(`${BaseUrl}/chip`);
    }
  }


  override componentDidMount() {
    window.addEventListener('beforeunload', () => {
      this.state.host?.client.close();
    }, { signal: this.controller.signal });

    document.addEventListener('keydown', (event) => {
      if (event.code === 'KeyR' && (event.altKey || event.ctrlKey)) {
        event.preventDefault();

        this.pool.add(async () => {
          if (event.ctrlKey && this.state.host) {
            await this.state.host.client.request({ type: 'reloadUnits' });
          }

          if (event.altKey) {
            await this.loadUnitClients(undefined, { development: true });
          }
        });
      }
    }, { signal: this.controller.signal });

    navigation.addEventListener('navigate', (event: any) => {
      if (event.canIntercept && !event.hashChange && !event.downloadRequest) {
        let url = event.destination.url;
        let routeData = this.resolveNavigation(url);

        if (this.unsavedDataCallback) {
          let viewRouteMatch = (routeData?.route.component === this.state.currentRouteData!.route.component)
            ? createViewRouteMatchFromRouteData(routeData)
            : null;

          let result = this.unsavedDataCallback(viewRouteMatch);

          if (result !== true) {
            event.preventDefault();

            if (result !== false) {
              this.pool.add(async () => {
                if (await result) {
                  this.unsavedDataCallback = null;
                  navigation.navigate(url, { info: event.info });
                }
              });
            }

            return;
          }
        }

        event.intercept({
          handler: async () => {
            this.handleNavigation(url, routeData);
          }
        });
      }
    }, { signal: this.controller.signal });

    this.pool.add(async () => {
      // Initialize the app backend

      await this.appBackend.initialize();


      // Initialize the host communication

      let result = await this.initializeHost();

      if (!result) {
        return;
      }

      let [state, plugins] = result;


      // Initialize stores

      await this.persistentStoreManager.initialize([
        ...ApplicationPersistentStoreDefaults,
        ...Object.entries(plugins).flatMap(([namespace, plugin]) => {
          return (plugin.persistentStoreDefaults ?? []).map(([key, value]) => [
            concatStoreEntryKeys(['plugin', namespace] as const, key),
            value
          ] as [['plugin', PluginName, ...OrdinaryId[]], unknown])
        })
      ]);

      await this.sessionStoreManager.initialize([
        ...ApplicationSessionStoreDefaults,
        ...Object.entries(plugins).flatMap(([namespace, plugin]) => {
          return (plugin.sessionStoreDefaults ?? []).map(([key, value]) => [
            concatStoreEntryKeys(['plugin', namespace] as const, key),
            value
          ] as [['plugin', PluginName, ...OrdinaryId[]], unknown])
        })
      ]);


      // List and compile known drafts if available

      let draftItems = await this.appBackend.listDrafts();
      let drafts = Object.fromEntries(
        draftItems.map((draftItem) => {
          return [draftItem.id, createDraftFromItem(draftItem)];
        })
      );

      this.setState({ drafts });

      // for (let draft of Object.values(drafts)) {
      //   if (draft.item.readable) {
      //     this.setDraft(draft, { skipAnalysis: true, skipWrite: true });
      //   }
      // }


      // Initialize the route

      let url = navigation.currentEntry.url;
      this.handleNavigation(url, this.resolveNavigation(url));
    });
  }

  override componentWillUnmount() {
    this.controller.abort();
  }


  async createDraft(options: { directory: boolean; }): Promise<DraftId | null> {
    let sample = await this.state.host!.client.request({ type: 'createDraftSample' });
    let draftItem = await this.appBackend.createDraft({
      directory: options.directory,
      source: sample
    });

    if (draftItem) {
      this.setState((state) => ({
        drafts: {
          ...state.drafts,
          [draftItem!.id]: createDraftFromItem(draftItem!)
        }
      }));
    }

    return (draftItem?.id ?? null);
  }

  async deleteDraft(draftId: DraftId) {
    this.setOpenDraftIds((openDraftIds) => openDraftIds.delete(draftId));

    this.setState((state) => {
      let { [draftId]: _, ...drafts } = state.drafts;
      return { drafts };
    });

    await this.appBackend.deleteDraft(draftId);
  }

  async loadDraft(options: { directory: boolean; }): Promise<DraftId | null> {
    let draftItem = await this.appBackend.loadDraft(options);

    if (draftItem) {
      this.setState((state) => ({
        drafts: {
          ...state.drafts,
          [draftItem!.id]: createDraftFromItem(draftItem!)
        }
      }));
    }

    return (draftItem?.id ?? null);
  }

  async saveDraftSource(draft: Draft, source: string) {
    let compilationTime = Date.now();
    draft.meta.compilationTime = compilationTime;

    await draft.item.write({ source });

    this.setState((state) => {
      return {
        drafts: {
          ...state.drafts,
          [draft.id]: {
            ...state.drafts[draft.id],
            lastModified: draft.item.lastModified
          }
        }
      }
    });
  }

  async saveDraftCompilation(draft: Draft, compilation: DraftCompilation) {
    this.setState((state) => {
      let stateDraft = state.drafts[draft.id];

      if (!stateDraft) {
        return null;
      }

      return {
        drafts: {
          ...state.drafts,
          [draft.id]: {
            ...stateDraft,
            compilation,
            name: compilation!.protocol?.name ?? stateDraft.name // ?? draft.item.name
          }
        }
      }
    });

    if (compilation.protocol?.name) {
      await draft.item.write({
        name: compilation.protocol.name
      });
    }
  }

  async watchDraft(draftId: DraftId, options: { signal: AbortSignal; }) {
    await this.state.drafts[draftId].item.watch(() => {
      this.setState((state) => {
        let draft = state.drafts[draftId];
        let draftItem = draft.item;

        return {
          drafts: {
            ...state.drafts,
            [draftId]: {
              ...draft,
              lastModified: draftItem.lastModified,
              revision: draftItem.revision,
              readable: draftItem.readable,
              writable: draftItem.writable
            }
          }
        };
      });
    }, { signal: options.signal });
  }


  setOpenDraftIds(func: (value: ImSet<DraftId>) => ImSet<DraftId>) {
    this.setState((state) => ({ openDraftIds: func(state.openDraftIds) }));
  }


  override render() {
    let contents = null;
    let routeData = this.state.currentRouteData;

    if (routeData && this.state.host?.plugins) {
      let Component = routeData.route.component;
      let viewRouteMatch = createViewRouteMatchFromRouteData(routeData);

      let key = Component.hash?.({
        app: this,
        host: this.state.host,
        route: viewRouteMatch
      }) ?? '';

      contents = (
        <ApplicationStoreContext.Provider value={this.store}>
          <ErrorBoundary>
            <Component
              app={this}
              host={this.state.host}
              route={viewRouteMatch}
              setUnsavedDataCallback={(callback) => {
                this.unsavedDataCallback = callback;
              }}
              key={key} />
          </ErrorBoundary>
        </ApplicationStoreContext.Provider>
      );
    }

    return (
      <div className={styles.root}>
        <Sidebar
          host={this.state.host}
          hostInfo={this.props.hostInfo}

          setStartup={this.props.setStartup} />
        {contents}
      </div>
    );
  }
}
