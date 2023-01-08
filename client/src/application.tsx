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
import { BaseUrl } from './constants';
import { ViewType } from './interfaces/view';

import styles from '../styles/components/application.module.scss';


const Views: ViewType[] = [ViewConf, ViewDesign];

const Routes: Route[] = Views.map((View) => ({
  component: View,
  pattern: new URLPattern({
    baseURL: BaseUrl,
    id: View.route.id,
    pathname: View.route.pattern
  })
}));


export interface Route {
  component: ViewType;
  pattern: URLPattern;
}

export interface RouteData {
  groups: any;
  route: Route;
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

  async handleNavigation(url: string) {
    let currentRoute: Route | null = null;
    let match: any;

    for (let route of Routes) {
      match = route.pattern.exec(url);

      if (match) {
        currentRoute = route;
        break;
      }
    }

    if (currentRoute) {
      this.setState({
        currentRouteData: {
          groups: match.pathname.groups,
          route: currentRoute
        }
      });
    } else {
      await navigation.navigate('/design');
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
        event.intercept({
          handler: async () => {
            await this.handleNavigation(event.destination.url);
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

      this.handleNavigation(navigation.currentEntry.url);
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


  setRoute(route: Route) {
    this.setState({ currentRoute: route });
    window.sessionStorage['route'] = JSON.stringify(route);

    if ((route[0] === 'protocol') && (route.length === 3)) {
      this.setOpenDraftIds((openDraftIds) => openDraftIds.add(route[1] as DraftId));
    }
  }

  render() {
    let setRoute = this.setRoute.bind(this);

    let contents = null;

    if (this.state.currentRouteData && this.state.host?.units) {
      let routeData = this.state.currentRouteData;
      let Component = routeData.route.component;

      contents = (
        <Component
          app={this}
          host={this.state.host} />
      );
    }

    return (
      <div className={styles.root}>
        <Sidebar
          currentRoute={this.state.currentRoute}
          setRoute={setRoute}
          setStartup={this.props.setStartup}

          host={this.state.host}
          hostInfo={this.props.hostInfo}

          drafts={this.state.drafts}
          openDraftIds={this.state.openDraftIds} />
        {contents}
      </div>
    );
  }
}
