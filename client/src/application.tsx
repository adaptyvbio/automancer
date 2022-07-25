import * as idb from 'idb-keyval';
import { Set as ImSet, removeIn, setIn } from 'immutable';
import * as React from 'react';

import type { AppBackend, DraftItem } from './app-backends/base';
import { BrowserAppBackend } from './app-backends/browser';
import { BackendCommon, ChipId, HostId, HostState, Protocol } from './backends/common';
import WebsocketBackend from './backends/websocket';
import { PyodideBackend } from './backends/pyodide';
import { Sidebar } from './components/sidebar';
import { Draft, DraftId, DraftPrimitive, DraftsRecord } from './draft';
import { ViewChip, ViewChipMode } from './views/chip';
import { ViewChips } from './views/chips';
import { ViewDraft, ViewDraftMode } from './views/draft';
import { ViewTerminalSession } from './views/terminal-session';
import { ViewProtocols } from './views/protocols';
import { Pool } from './util';
import * as util from './util';
import { analyzeProtocol } from './analysis';



export interface Host {
  backend: BackendCommon;
  id: HostId;
  state: HostState;
}

export type LocalBackendStorage = {
  type: 'filesystem';
  handle: FileSystemDirectoryHandle;
} | {
  type: 'persistent';
} | {
  type: 'memory';
};

export type HostSettingsEntryBackendOptions = {
  type: 'remote';
  address: string;
  port: number;
  secure: boolean;
} | {
  type: 'internal';
  Backend: { new(): BackendCommon; };
} | {
  type: 'local';
  id: string;
  storage: LocalBackendStorage;
} | {
  type: 'inactive';
};

export interface HostSettingsEntry {
  id: string;
  builtin: boolean;
  disabled: boolean;
  hostId: HostId | null;
  locked: boolean;
  name: string | null;

  backendOptions: HostSettingsEntryBackendOptions;
}

export interface Settings {
  defaultHostId: HostId | null;
  hosts: Record<string, HostSettingsEntry>;
}


// ---


export type Route = (number | string)[];


export interface ApplicationProps {
  initialSettings: Settings;
}

export interface ApplicationState {
  hosts: Record<HostId, Host>;
  settings: Settings;

  drafts: DraftsRecord;
  openDraftIds: ImSet<DraftId>;

  currentRoute: Route | null;
  selectedHostId: HostId | null;
}

export class Application extends React.Component<ApplicationProps, ApplicationState> {
  controller = new AbortController();
  pool = new Pool();

  appBackend = new BrowserAppBackend({
    onDraftsUpdate: (update, options) => {
      this.setState((state) => {
        let drafts = { ...state.drafts };

        for (let [draftId, draftItem] of Object.entries(update)) {
          if (!draftItem) {
            delete drafts[draftId];
            continue;
          }

          drafts[draftId] = {
            id: draftId,
            ...(drafts[draftId] as Draft | undefined),
            compiled: null,
            item: draftItem
          };

          if (this.host && !options?.skipCompilation) {
            this.pool.add(async () => {
              await this.compileDraft(draftItem!);
            });
          }
        }

        return { drafts };
      });
    }
  });

  constructor(props: ApplicationProps) {
    super(props);

    this.state = {
      hosts: {},
      settings: props.initialSettings,

      drafts: {},
      openDraftIds: ImSet(),

      currentRoute: ['chip'],
      selectedHostId: null
    };

    for (let hostSettings of Object.values(props.initialSettings.hosts)) {
      this.updateHostLocation(hostSettings);
    }
  }

  get host() {
    return this.state.selectedHostId
      ? this.state.hosts[this.state.selectedHostId]
      : null;
  }

  updateHostLocation(hostSettingsEntry: HostSettingsEntry) {
    if (hostSettingsEntry.hostId) {
      this.setState((state) => ({
        hosts: removeIn(state.hosts, [hostSettingsEntry.hostId]),
        settings: setIn(state.settings, ['hosts', hostSettingsEntry.id, 'hostId'], null)
      }));
    }

    let backend = (() => {
      switch (hostSettingsEntry.backendOptions.type) {
        case 'internal': return new hostSettingsEntry.backendOptions.Backend();

        case 'local': return new PyodideBackend({
          id: hostSettingsEntry.backendOptions.id,
          storage: hostSettingsEntry.backendOptions.storage
        });

        case 'remote': return new WebsocketBackend({
          address: hostSettingsEntry.backendOptions.address,
          port: hostSettingsEntry.backendOptions.port,
          secure: hostSettingsEntry.backendOptions.secure
        });
      }
    })();

    if (backend) {
      (async () => {
        try {
          await backend.start();
        } catch (err) {
          console.error(`Backend of host failed to start with error: ${(err as Error).message}`);
          console.error(err);
          return;
        }

        console.log('Initial state ->', backend.state);

        let host = {
          backend,
          id: backend.state.info.id,
          state: backend.state
        };

        this.setState((state) => ({
          hosts: setIn(state.hosts, [host.id], host),
          settings: setIn(state.settings, ['hosts', hostSettingsEntry.id, 'hostId'], host.id)
        }));

        backend.onUpdate(() => {
          console.log('New state ->', backend!.state);

          this.setState((state) => ({
            hosts: setIn(state.hosts, [host.id, 'state'], backend!.state)
          }));
        });

        if (!this.state.selectedHostId) {
          this.setState({
            selectedHostId: host.id
          });
        }

        backend.closed
          .catch((err) => {
            console.error(`Backend of host '${host.id}' terminated with error: ${err.message ?? err}`);
            console.error(err);
          })
          .finally(() => {
            this.setState((state) => ({
              hosts: removeIn(state.hosts, [host.id]),
              settings: setIn(state.settings, ['hosts', hostSettingsEntry.id, 'hostId'], null)
            }));
          });
      })();
    }
  }

  componentDidMount() {
    window.addEventListener('beforeunload', () => {
      for (let host of Object.values(this.state.hosts)) {
        host.backend.close();
      }
    }, { signal: this.controller.signal });


    this.pool.add(async () => {
      // await new Promise((r) => setTimeout(r, 200));
      await this.appBackend.initialize();
    });


    let route;

    try {
      route = JSON.parse(window.sessionStorage['route']);
    } catch {
      return;
    }

    this.setRoute(route);
  }

  componentDidUpdate(_prevProps: ApplicationProps, prevState: ApplicationState) {
    // if (this.state) {
    //   console.group()
    //   Object.entries(this.state).forEach(([key, val]) =>
    //     prevState[key] !== val && console.log(`State '${key}' changed`)
    //   );
    //   console.groupEnd()
    // }

    if (prevState.selectedHostId !== this.state.selectedHostId) {
      this.pool.add(async () => {
        for (let draft of Object.values(this.state.drafts)) {
          await this.compileDraft(draft.item);
        }
      });
    }
  }

  componentWillUnmount() {
    this.controller.abort();
  }


  async compileDraft(draftItem: DraftItem) {
    let blob = await draftItem.getMainFile();

    if (blob) {
      let source = await blob.text();
      let compiled = await this.host!.backend.compileDraft(draftItem.id, source);

      await this.appBackend.setDraft(draftItem.id, {
        name: compiled.protocol?.name ?? draftItem.name
      }, { skipCompilation: true });

      this.setState((state) => ({
        drafts: {
          ...state.drafts,
          [draftItem.id]: {
            ...state.drafts[draftItem.id],
            compiled
          }
        }
      }));
    }
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
    // let createDraft = this.createDraft.bind(this);
    // let deleteDraft = this.deleteDraft.bind(this);
    // let setDraft = this.setDraft.bind(this);
    let setRoute = this.setRoute.bind(this);

    let contents = (() => {
      let route = this.state.currentRoute;

      if (!route || !this.host) {
        return null;
      }

      if (route.length === 1) {
        switch (route[0]) {
          case 'chip': return (
            <ViewChips
              host={this.host}
              setRoute={setRoute} />
          );

          case 'protocol': return (
            <ViewProtocols
              app={this}
              drafts={this.state.drafts}
              host={this.host}
              setRoute={setRoute} />
          )

          case 'terminal': return (
            <ViewTerminalSession
              host={this.host}
              setRoute={setRoute} />
          );
        }
      } else if (route.length === 3) {
        switch (route[0]) {
          case 'chip': return (
            <ViewChip
              chipId={route[1] as ChipId}
              host={this.host}
              mode={route[2] as ViewChipMode}
              setRoute={setRoute} />
          );

          case 'protocol': {
            let draft = this.state.drafts[route[1]];

            if (!draft) {
              this.setRoute([route[0]]);
              return null;
            }

            // TODO: Improve
            if (!draft.compiled) {
              // this.pool.add(async () => {
              //   await this.compileDraft(draft.entry);
              // });
            }

            return (
              <ViewDraft
                app={this}
                draft={draft}
                host={this.host}
                mode={route[2] as ViewDraftMode}
                setRoute={setRoute} />
            );
          };
        }
      }
    })();

    return (
      <>
        <Sidebar
          currentRoute={this.state.currentRoute}
          setRoute={setRoute}

          hosts={this.state.hosts}
          selectedHostId={this.state.selectedHostId}
          onSelectHost={(id) => {
            this.setState({ selectedHostId: id });
          }}

          drafts={this.state.drafts}
          openDraftIds={this.state.openDraftIds} />
        {contents}
      </>
    );
  }
}
