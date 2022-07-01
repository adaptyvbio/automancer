import * as idb from 'idb-keyval';
import { Set as ImSet, removeIn, setIn } from 'immutable';
import * as React from 'react';

import { AppBackend, DraftEntry } from './app-backend';
import { BackendCommon, ChipId, HostId, HostState, Protocol } from './backends/common';
import WebsocketBackend from './backends/websocket';
import { PyodideBackend } from './backends/pyodide';
import { Sidebar } from './components/sidebar';
import { Draft, DraftId, DraftPrimitive, DraftsRecord, getDraftEntrySource } from './draft';
import { ViewChip, ViewChipMode } from './views/chip';
import { ViewChipSettings } from './views/chip-settings';
import { ViewChips } from './views/chips';
import { ViewDraft } from './views/draft';
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

  appBackend = new AppBackend({
    onDraftsUpdate: (update, options) => {
      this.setState((state) => {
        let drafts = { ...state.drafts };

        for (let [draftId, draftEntry] of Object.entries(update)) {
          if (!draftEntry) {
            delete drafts[draftId];
            continue;
          }

          drafts[draftId] = {
            id: draftId,
            ...(drafts[draftId] as Draft | undefined),
            compiled: null,
            entry: draftEntry
          };

          if (this.host && !options.skipCompilation) {
            this.pool.add(async () => {
              await this.compileDraft(draftEntry!);
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

      currentRoute: ['dashboard'],
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
    if (prevState.selectedHostId !== this.state.selectedHostId) {
      this.pool.add(async () => {
        for (let draft of Object.values(this.state.drafts)) {
          await this.compileDraft(draft.entry);
        }
      });
    }
  }

  componentWillUnmount() {
    this.controller.abort();
  }


  async compileDraft(draftEntry: DraftEntry) {
    let source = await getDraftEntrySource(draftEntry);

    if (source !== null) {
      let compiled = await this.host!.backend.compileDraft(draftEntry.id, source);

      await this.appBackend.setDraft({
        id: draftEntry.id,
        name: compiled.protocol?.name ?? draftEntry.name
      }, { skipCompilation: true });

      this.setState((state) => ({
        drafts: {
          ...state.drafts,
          [draftEntry.id]: {
            ...state.drafts[draftEntry.id],
            compiled
          }
        }
      }));
    }
  }

  async createDraft(location: DraftEntry['location']): Promise<DraftId> {
    let lastModified = (location.type === 'filesystem')
      ? (await location.handle.getFile()).lastModified
      : Date.now();

    let id = crypto.randomUUID();

    await this.appBackend.setDraft({
      id,
      name: null,
      lastModified,
      location
    });

    return id;
  }

  async deleteDraft(draftId: DraftId) {
    this.setOpenDraftIds((openDraftIds) => openDraftIds.delete(draftId));
    await this.appBackend.deleteDraft(draftId);
  }

  async setDraft(draftPrimitive: DraftPrimitive) {
    let draft = this.state.drafts[draftPrimitive.id];

    switch (draft.entry.location.type) {
      case 'app': {
        await this.appBackend.setDraft({
          ...draft.entry,
          lastModified: Date.now(),
          location: {
            ...draft.entry.location,
            source: draftPrimitive.source
          }
        });
      }
    }
  }

  setOpenDraftIds(func: (value: ImSet<DraftId>) => ImSet<DraftId>) {
    this.setState((state) => ({ openDraftIds: func(state.openDraftIds) }));
  }


  setRoute(route: Route) {
    this.setState({ currentRoute: route });
    window.sessionStorage['route'] = JSON.stringify(route);

    if ((route[0] === 'protocol') && (route.length === 2)) {
      this.setOpenDraftIds((openDraftIds) => openDraftIds.add(route[1] as DraftId));
    }
  }

  render() {
    let createDraft = this.createDraft.bind(this);
    let deleteDraft = this.deleteDraft.bind(this);
    let setDraft = this.setDraft.bind(this);
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
              drafts={this.state.drafts}
              host={this.host}
              createDraft={createDraft}
              deleteDraft={deleteDraft}
              setDraft={setDraft}
              setRoute={setRoute} />
          )

          case 'terminal': return (
            <ViewTerminalSession
              host={this.host}
              setRoute={setRoute} />
          );
        }
      } else if (route.length === 2) {
        switch (route[0]) {
          case 'protocol': {
            let draft = this.state.drafts[route[1]];

            if (!draft) {
              this.setRoute([route[0]]);
              return null;
            }

            // TODO: Improve
            if (!draft.compiled) {
              this.pool.add(async () => {
                await this.compileDraft(draft.entry);
              });
            }

            return (
              <ViewDraft
                draft={draft}
                host={this.host}
                setDraft={setDraft}
                setRoute={setRoute} />
            );
          }
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
