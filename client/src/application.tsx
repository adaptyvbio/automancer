import { Set as ImSet, removeIn, setIn } from 'immutable';
import * as React from 'react';

import type { AppBackend, DraftItem } from './app-backends/base';
import type { Chip, ChipId } from './backends/common';
import { Sidebar } from './components/sidebar';
import { createDraftFromItem, Draft, DraftCompilation, DraftId, DraftPrimitive, DraftsRecord } from './draft';
import type { Host } from './host';
import { ViewChip } from './views/chip';
import { ViewChips } from './views/chips';
import { ViewDesign } from './views/test/design';
import { ViewDraft } from './views/draft';
import { ViewExecution } from './views/execution';
import { ViewProtocols } from './views/protocols';
import { ViewConf } from './views/conf';
import { Pool } from './util';
import { Unit, UnitNamespace } from './units';
import { BaseBackend } from './backends/base';
import { HostInfo } from './interfaces/host';
import { BaseUrl, BaseUrlPathname } from './constants';
import { UnsavedDataCallback, ViewRouteMatch, ViewType } from './interfaces/view';

import styles from '../styles/components/application.module.scss';


const Views: ViewType[] = [ViewChip, ViewChips, ViewConf, ViewDesign];

console.log(BaseUrl)
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
  backend: BaseBackend;
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

  constructor(props: ApplicationProps) {
    super(props);

    this.state = {
      host: null,

      drafts: {},
      openDraftIds: ImSet(),

      currentRouteData: null
    };
  }

  get appBackend(): AppBackend {
    return this.props.appBackend;
  }

  async initializeHost() {
    let backend = this.props.backend;

    try {
      await backend.start();
    } catch (err) {
      console.error(`Backend of host failed to start with error: ${(err as Error).message}`);
      console.error(err);
      return;
    }

    console.log('Initial state ->', backend.state);

    backend.onUpdate(() => {
      console.log('New state ->', backend.state);

      this.setState((state) => ({
        host: {
          ...state.host!,
          state: backend.state
        }
      }));
    }, { signal: this.controller.signal });

    let host: Host = {
      backend,
      id: backend.state.info.id,
      state: backend.state,
      units: (null as unknown as Host['units'])
    };

    this.setState({ host }, () => {
      this.props.onHostStarted?.();
    });

    this.pool.add(async () => void await this.loadUnitClients(host));

    backend.closed
      .catch((err) => {
        console.error(`Backend of host '${host.id}' terminated with error: ${err.message ?? err}`);
        console.error(err);
      })
      .finally(() => {
        this.setState({ host: null });
      });

      return backend.state;
  }

  async loadUnitClients(host: Host = this.state.host!, options?: { development?: unknown; }) {
    let targetUnitsInfo = Object.values(host.state.info.units)
      .filter((unitInfo) => unitInfo.enabled && (!options?.development || unitInfo.development));

    if (host.units) {
      let expiredStyleSheets = targetUnitsInfo.flatMap((unitInfo) => {
        let unit = host.units[unitInfo.namespace];
        return unit?.styleSheets ?? [];
      });

      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => !expiredStyleSheets.includes(sheet));
    }

    let units: Record<UnitNamespace, Unit<unknown, unknown>> = Object.fromEntries(
      (await Promise.all(
        targetUnitsInfo
          .filter((unitInfo) => unitInfo.hasClient)
          .map(async (unitInfo) => {
            console.log(`%cLoading unit %c${unitInfo.namespace}%c (${unitInfo.version})`, '', 'font-weight: bold;', '');

            try {
              let unit = await host.backend.loadUnit(unitInfo);
              return [unitInfo.namespace, unit];
            } catch (err) {
              console.error(`%cFailed to load unit %c${unitInfo.namespace}%c (${unitInfo.version})`, '', 'font-weight: bold;', '');
              console.error(err);

              return [unitInfo.namespace, null];
            }
          })
      )).filter(([_namespace, unit]) => unit)
    );

    document.adoptedStyleSheets.push(...Object.values(units).flatMap((unit) => unit.styleSheets ?? []));

    this.setState((state) => ({
      host: {
        ...state.host!,
        units: {
          ...state.host!.units,
          ...units
        }
      }
    }));
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

  handleNavigation(routeData: RouteData | null) {
    if (routeData) {
      this.setState({
        currentRouteData: routeData
      });
    } else {
      navigation.navigate(`${BaseUrl}/chip`);
    }
  }


  componentDidMount() {
    window.addEventListener('beforeunload', () => {
      this.state.host?.backend.close();
    }, { signal: this.controller.signal });

    document.addEventListener('keydown', (event) => {
      if (event.code === 'KeyR' && (event.altKey || event.ctrlKey)) {
        event.preventDefault();

        this.pool.add(async () => {
          if (event.ctrlKey && this.state.host) {
            await this.state.host.backend.reloadUnits();
          }

          if (event.altKey) {
            await this.loadUnitClients(undefined, { development: true });
          }
        });
      }
    }, { signal: this.controller.signal });

    navigation.addEventListener('navigate', (event: any) => {
      if (event.canIntercept && !event.hashChange && !event.downloadRequest) {
        let routeData = this.resolveNavigation(event.destination.url);

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
                  await navigation.navigate(event.destination.url, { info: event.info });
                }
              });
            }

            return;
          }
        }

        event.intercept({
          handler: async () => {
            this.handleNavigation(routeData);
          }
        });
      }
    }, { signal: this.controller.signal });

    this.pool.add(async () => {
      // Initialize the app backend

      await this.appBackend.initialize();


      // Initialize the host communication

      let state = await this.initializeHost();

      if (!state) {
        return;
      }


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

      this.handleNavigation(this.resolveNavigation(navigation.currentEntry.url));
    });
  }

  componentWillUnmount() {
    this.controller.abort();
  }


  async createDraft(options: { directory: boolean; }): Promise<DraftId | null> {
    let sample = await this.state.host!.backend.createDraftSample();
    let draftItem = await this.appBackend.createDraft({ directory: options.directory, source: sample });

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


  render() {
    let contents = null;
    let routeData = this.state.currentRouteData;

    if (routeData && this.state.host?.units) {
      let Component = routeData.route.component;
      let viewRouteMatch = createViewRouteMatchFromRouteData(routeData);

      let key = Component.hash?.({
        app: this,
        host: this.state.host,
        route: viewRouteMatch
      }) ?? '';

      contents = (
        <Component
          app={this}
          host={this.state.host}
          route={viewRouteMatch}
          setUnsavedDataCallback={(callback) => {
            this.unsavedDataCallback = callback;
          }}
          key={key} />
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
