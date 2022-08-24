import { Set as ImSet, removeIn, setIn } from 'immutable';
import * as React from 'react';

import type { AppBackend, DraftItem } from './app-backends/base';
import type { ChipId } from './backends/common';
import { createBackend } from './backends/misc';
import { Sidebar } from './components/sidebar';
import type { Draft, DraftId, DraftPrimitive, DraftsRecord } from './draft';
import type { Host, HostSettings, HostSettingsRecord } from './host';
import { ViewChip } from './views/chip';
import { ViewChips } from './views/chips';
import { ViewDraft, ViewDraftMode } from './views/draft';
import { ViewTerminalSession } from './views/terminal-session';
import { ViewProtocols } from './views/protocols';
import { ViewSettings } from './views/settings';
import { Pool } from './util';
import { Unit, UnitNamespace } from './units';


export type Route = (number | string)[];


export interface ApplicationProps {
  appBackend: AppBackend;
  hostSettings: HostSettings;
  hostSettingsRecord: HostSettingsRecord;

  setStartup(): void;
}

export interface ApplicationState {
  host: Host | null;

  drafts: DraftsRecord;
  openDraftIds: ImSet<DraftId>;

  currentRoute: Route | null;
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

      currentRoute: null
    };
  }

  get appBackend(): AppBackend {
    return this.props.appBackend;
  }

  async initializeHost() {
    let backendOptions = this.props.hostSettings.backendOptions;
    let backend = (await this.appBackend.createBackend?.(backendOptions))
      ?? (await createBackend(backendOptions));

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

    this.setState({ host });

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
        targetUnitsInfo.map(async (unitInfo) => {
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

  componentDidMount() {
    window.addEventListener('beforeunload', () => {
      this.state.host?.backend.close();
    }, { signal: this.controller.signal });

    document.addEventListener('keydown', (event) => {
      if (event.code === 'KeyR' && (event.altKey || event.ctrlKey)) {
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

    // this.props.appBackend.onDraftsUpdate(({ options, update }) => {
    //   this.setState((state) => {
    //     let drafts = { ...state.drafts };
    //     let openDraftIds = state.openDraftIds;

    //     for (let [draftId, draftItem] of Object.entries(update)) {
    //       if (!draftItem) {
    //         delete drafts[draftId];
    //         openDraftIds = openDraftIds.remove(draftId);

    //         continue;
    //       }

    //       drafts[draftId] = {
    //         id: draftId,
    //         ...(drafts[draftId] as Draft | undefined),
    //         compiled: null,
    //         item: draftItem
    //       };

    //       if (this.state.host && !options?.skipCompilation) {
    //         this.pool.add(async () => {
    //           await this.compileDraft(draftItem!);
    //         });
    //       }
    //     }

    //     return { drafts, openDraftIds };
    //   });
    // });

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
        draftItems.map((draftItem): [DraftId, Draft] => {
          return [draftItem.id, {
            id: draftItem.id,
            compilation: null,
            name: draftItem.name,
            item: draftItem,
            revision: draftItem.revision,
            readable: draftItem.readable,
            writable: draftItem.writable
          }];
        })
      );

      this.setState({ drafts });

      for (let draft of Object.values(drafts)) {
        if (draft.item.readable) {
          this.setDraft(draft, { skipAnalysis: true });
        }
      }


      // Initialize the route

      let route!: Route;

      try {
        route = JSON.parse(window.sessionStorage['route']);
      } catch {
        route = ['chip'];
      }

      if ((route[0] === 'chip') && (route.length === 3) && !(state.chips[route[1]])) {
        route = ['chip'];
      }

      this.setRoute(route);
    });
  }

  componentWillUnmount() {
    this.controller.abort();
  }


  async deleteDraft(draftId: DraftId) {
    this.setOpenDraftIds((openDraftIds) => openDraftIds.delete(draftId));

    this.setState((state) => {
      let { [draftId]: _, ...drafts } = state.drafts;
      return { drafts };
    });

    await this.appBackend.deleteDraft(draftId);
  }

  async loadDraft(options: { directory: boolean; }) {
    let draftItem = await this.appBackend.loadDraft(options);

    if (draftItem) {
      this.setState((state) => ({
        drafts: {
          ...state.drafts,
          [draftItem!.id]: {
            id: draftItem!.id,
            compilation: null,
            name: draftItem!.name,
            item: draftItem!,
            revision: draftItem!.revision,
            readable: draftItem!.readable,
            writable: draftItem!.writable
          }
        }
      }));
    }

    return draftItem?.id;
  }

  setDraft(draft: Draft, options: { skipAnalysis: boolean; source?: string; }) {
    // let draft = this.state.drafts[draftId];

    this.pool.add(async () => {
      if (options.source) {
        await this.appBackend.setDraft(draft.id, { source: options.source });
      }

      let compilation = await this.state.host!.backend.compileDraft({
        draftItem: draft.item,
        skipAnalysis: options.skipAnalysis
      });

      this.setState((state) => {
        let stateDraft = state.drafts[draft.id];

        if (stateDraft && (!options.skipAnalysis || !stateDraft.compilation)) {
          return {
            drafts: {
              ...state.drafts,
              [draft.id]: {
                ...stateDraft,
                compilation,
                name: compilation.protocol?.name ?? draft.item.name
              }
            }
          };
        }

        return null;
      });

      if (compilation?.protocol?.name) {
        await this.appBackend.setDraft(draft.id, {
          name: compilation.protocol.name
        });
      }
    });
  }

  watchDraft(draftId: DraftId, options: { signal: AbortSignal; }) {
    this.state.drafts[draftId].item.watch(() => {
      this.setState((state) => {
        let draft = state.drafts[draftId];
        let draftItem = draft.item;

        return {
          drafts: {
            ...state.drafts,
            [draftId]: {
              ...draft,
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

    let contents = (() => {
      let route = this.state.currentRoute;

      if (!route || !this.state.host?.units) {
        return null;
      }

      if (route.length === 1) {
        switch (route[0]) {
          case 'chip': return (
            <ViewChips
              host={this.state.host}
              setRoute={setRoute} />
          );

          case 'protocol': return (
            <ViewProtocols
              app={this}
              drafts={this.state.drafts}
              host={this.state.host}
              setRoute={setRoute} />
          )

          case 'settings': return (
            <ViewSettings
              app={this}
              host={this.state.host}
              setRoute={setRoute} />
          );

          case 'terminal': return (
            <ViewTerminalSession
              host={this.state.host}
              setRoute={setRoute} />
          );
        }
      } else if (route.length === 3) {
        switch (route[0]) {
          case 'chip': return (
            <ViewChip
              chipId={route[1] as ChipId}
              host={this.state.host}
              tab={route[2] as string}
              setRoute={setRoute} />
          );

          case 'protocol': {
            let draft = this.state.drafts[route[1]];

            if (!draft) {
              this.setRoute([route[0]]);
              return null;
            }

            // TODO: Improve
            if (!draft.compilation) {
              // this.pool.add(async () => {
              //   await this.compileDraft(draft.entry);
              // });
            }

            return (
              <ViewDraft
                app={this}
                draft={draft}
                host={this.state.host}
                mode={route[2] as ViewDraftMode}
                setRoute={setRoute} />
            );
          }

          case 'unit': {
            let unit = this.state.host!.units[route[1]];
            let entries = (unit.getGeneralTabs?.() ?? []);
            let entry = entries.find((entry) => entry.id === route![2]);
            let Component = entry!.component;

            return (
              <Component
                host={this.state.host!}
                setRoute={this.setRoute} />
            );
          }
        }
      }
    })();

    return (
      <div className="app">
        <Sidebar
          currentRoute={this.state.currentRoute}
          setRoute={setRoute}
          setStartup={this.props.setStartup}

          host={this.state.host}
          hostSettingsRecord={this.props.hostSettingsRecord}
          selectedHostSettingsId={this.props.hostSettings.id}
          onSelectHost={(id) => {
            // this.setState({ selectedHostId: id });
          }}

          drafts={this.state.drafts}
          openDraftIds={this.state.openDraftIds} />
        {contents}
      </div>
    );
  }
}
