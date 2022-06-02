import * as idb from 'idb-keyval';
import { Set as ImSet, removeIn, setIn } from 'immutable';
import * as React from 'react';

import { BackendCommon, ChipId, HostId, HostState, Protocol } from './backends/common';
import WebsocketBackend from './backends/websocket';
import { PyodideBackend } from './backends/pyodide';
import { Sidebar } from './components/sidebar';
import { ViewChip } from './views/chip';
import { ViewChipSettings } from './views/chip-settings';
import { ViewChips } from './views/chips';
import { ViewDraft } from './views/draft';
import { ViewTerminalSession } from './views/terminal-session';
import { ViewProtocols } from './views/protocols';
import { Pool } from './util';



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

export type DraftId = string;

export interface Draft {
  id: DraftId;
  name: string;
  lastModified: number;
  source: string;

  compiled: {
    errors: {
      message: string;
      range: [number, number];
    }[];
    protocol: Protocol | null;
  } | null;

  location: {
    type: 'host';
  } | {
    type: 'filesystem';
    handle: FileSystemFileHandle;
    path: string;
  } | {
    type: 'memory';
  };
}


export interface DraftsRecord {
  draftIds: DraftId[];
}



// ---


export interface ApplicationProps {
  initialSettings: Settings;
}

export interface ApplicationState {
  hosts: Record<HostId, Host>;
  settings: Settings;

  drafts: Record<DraftId, Draft>;
  openDraftIds: ImSet<DraftId>;

  currentRoute: Route | null;
  selectedHostId: HostId | null;
}

export class Application extends React.Component<ApplicationProps, ApplicationState> {
  controller = new AbortController();
  pool = new Pool();

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
      let record = await idb.get<DraftsRecord>('drafts');

      if (record) {
        let drafts = await idb.getMany(record.draftIds);

        this.setState({
          drafts: {
            ...this.state.drafts,
            ...Object.fromEntries(
              drafts.map((draft) => [draft.id, draft])
            )
          }
        });
      }
    });


    let route;

    try {
      route = JSON.parse(window.localStorage['route']);
    } catch {
      return;
    }

    this.setRoute(route);
  }

  componentWillUnmount() {
    this.controller.abort();
  }

  setDraft(draft: Draft) {
    this.setState({
      drafts: setIn(this.state.drafts, [draft.id], draft),
      openDraftIds: this.state.openDraftIds.add(draft.id)
    });

    if (draft.location.type === 'memory') {
      let isNewDraft = !(draft.id in this.state.drafts);

      // TODO: make this an atomic operation
      this.pool.add(async () => {
        await idb.set(draft.id, { ...draft, analysis: null });

        if (isNewDraft) {
          await idb.update<DraftsRecord>('drafts', (record) => {
            return {
              draftIds: Array.from(new Set([...(record?.draftIds ?? []), draft.id]))
            };
          });
        }
      });
    }
  }

  setOpenDraftIds(func: (value: ImSet<DraftId>) => ImSet<DraftId>) {
    this.setState((state) => ({ openDraftIds: func(state.openDraftIds) }));
  }

  setRoute(route: Route) {
    this.setState({ currentRoute: route });
    window.localStorage['route'] = JSON.stringify(route);

    if ((route[0] === 'protocol') && (route.length === 2)) {
      this.setOpenDraftIds((openDraftIds) => openDraftIds.add(route[1] as DraftId));
    }
  }

  render() {
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
              onRouteChange={setRoute} />
          );

          case 'protocol': return (
            <ViewProtocols
              drafts={this.state.drafts}
              host={this.host}
              setDraft={setDraft}
              setRoute={setRoute} />
          )

          case 'terminal': return (
            <ViewTerminalSession
              host={this.host}
              setRoute={setRoute} />
          );
        }
      } else {
        switch (route[0]) {
          case 'chip': return (
            <ViewChip
              chipId={route[1] as ChipId}
              host={this.host}
              setRoute={setRoute} />
          );

          case 'protocol': return (
            <ViewDraft
              draft={this.state.drafts[route[1]]}
              host={this.host}
              setDraft={setDraft}
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
