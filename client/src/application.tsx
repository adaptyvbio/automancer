import { List, removeIn, setIn } from 'immutable';
import * as React from 'react';

import { BackendCommon, ChipId, HostId, HostState } from './backends/common';
import WebsocketBackend from './backends/websocket';
import { PyodideBackend } from './backends/pyodide';
import { Sidebar } from './components/sidebar';
import { ViewChip } from './views/chip';
import { ViewChipSettings } from './views/chip-settings';
import { ViewChips } from './views/chips';
import { ViewTerminalSession } from './views/terminal-session';



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


// ---


export interface ApplicationProps {
  initialSettings: Settings;
}

export interface ApplicationState {
  hosts: Record<HostId, Host>;
  settings: Settings;

  currentRoute: Route | null;
  selectedHostId: HostId | null;
}

export class Application extends React.Component<ApplicationProps, ApplicationState> {
  controller = new AbortController();

  constructor(props: ApplicationProps) {
    super(props);

    this.state = {
      hosts: {},
      settings: props.initialSettings,

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

  setRoute(route: Route) {
    this.setState({ currentRoute: route });
    window.localStorage['route'] = JSON.stringify(route);
  }

  render() {
    let setRoute = this.setRoute.bind(this);

    let contents = (() => {
      let route = this.state.currentRoute;

      if (!route || !this.host) {
        return null;
      }

      if (route.length === 1) {
        switch (route[0]) {
          case 'chip': return <ViewChips host={this.host} onRouteChange={setRoute} />;
          case 'terminal': return <ViewTerminalSession
            host={this.host}
            setRoute={setRoute} />
        }
      } else {
        switch (route[0]) {
          case 'chip': return <ViewChip
            chipId={route[1] as ChipId}
            host={this.host}
            setRoute={setRoute} />
        }
      }
    })();

    return (
      <>
        <Sidebar
          currentRoute={this.state.currentRoute}
          hosts={this.state.hosts}
          selectedHostId={this.state.selectedHostId}
          onSelectHost={(id) => {
            this.setState({ selectedHostId: id });
          }}
          onSelectRoute={setRoute} />
        {contents}
      </>
    );
  }
}
