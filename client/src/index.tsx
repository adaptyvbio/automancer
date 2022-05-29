import { List, removeIn, setIn } from 'immutable';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as Rf from 'retroflex';
import { Application, FragmentPaneRecord, ViewBlank, ViewPaneRecord } from 'retroflex';

import ViewChipSettings from './views/chip-settings';
import ViewControl from './views/control';
import ViewProtocolEditor from './views/protocol-editor';
import ViewProtocolRun from './views/protocol-run';
import ViewSettings from './views/settings';
import ViewTerminalSession from './views/terminal-session';
import ViewTest from './views/test';
import ViewTree from './views/tree';
import WebsocketBackend from './backends/websocket';
import { BackendCommon, HostId, HostState } from './backends/common';
// import { PyodideBackend } from './backends/pyodide';
import { HostCreator } from './components/host-creator';

import '../lib/styles.css';
import { PyodideBackend } from './backends/pyodide';


export { BackendCommon };

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

export interface Model {
  hosts: Record<HostId, Host>;
  settings: Settings;

  doneInitializing: boolean;
}

export interface AppProps {
  initialSettings: Settings;
}

class App extends Rf.Application<Model, {}, AppProps> {
  controller = new AbortController();

  constructor(props: AppProps) {
    super({
      layout: FragmentPaneRecord({
        horizontal: true,
        cuts: List([0.65]),
        panes: List([
          ViewPaneRecord({ view: 'terminal-session' }),
          ViewPaneRecord({ view: 'tree' })
        ])
      }),
      model: {
        hosts: {},
        settings: props.initialSettings,

        doneInitializing: Object.keys(props.initialSettings.hosts).length > 0
      },
      props
    });

    for (let hostSettings of Object.values(props.initialSettings.hosts)) {
      this.updateHostLocation(hostSettings);
    }

    this.registerViewGroup({
      id: 'general',
      name: 'General',
      compact: false
    });

    this.registerViewGroup({
      id: 'protocol',
      name: 'Protocol',
      compact: false
    });

    this.registerViewModel({
      id: 'blank',
      name: 'Blank',
      groupId: 'general',
      icon: 'apps',
      component: ViewBlank,
      shortcut: null
    });

    this.registerViewModel({
      id: 'tree',
      name: 'Tree',
      groupId: 'general',
      icon: 'account-tree',
      component: ViewTree,
      shortcut: 'T'
    });

    this.registerViewModel({
      id: 'control',
      name: 'Control',
      groupId: 'general',
      icon: 'toggle-on',
      component: ViewControl,
      shortcut: 'C'
    });

    this.registerViewModel({
      id: 'chip-settings',
      name: 'Chip settings',
      groupId: 'general',
      icon: 'tune',
      component: ViewChipSettings,
      shortcut: null
    });

    this.registerViewModel({
      id: 'settings',
      name: 'Settings',
      groupId: 'general',
      icon: 'settings',
      component: ViewSettings,
      shortcut: null
    });

    this.registerViewModel({
      id: 'protocol-editor',
      name: 'Protocol editor',
      groupId: 'protocol',
      icon: 'edit-note',
      component: ViewProtocolEditor,
      shortcut: null
    });

    this.registerViewModel({
      id: 'protocol-run',
      name: 'Protocol run',
      groupId: 'protocol',
      icon: 'receipt-long',
      component: ViewProtocolRun,
      shortcut: null
    });

    this.registerViewModel({
      id: 'test',
      name: 'Test',
      groupId: 'protocol',
      icon: 'receipt-long',
      component: ViewTest,
      shortcut: null
    });

    this.registerViewModel({
      id: 'terminal-session',
      name: 'Terminal session',
      groupId: 'protocol',
      icon: 'terminal',
      component: ViewTerminalSession,
      shortcut: null
    });
  }

  updateHostLocation(hostSettingsEntry: HostSettingsEntry) {
    if (hostSettingsEntry.hostId) {
      this.setModel((model) => ({
        hosts: removeIn(model.hosts, [hostSettingsEntry.hostId]),
        settings: setIn(model.settings, ['hosts', hostSettingsEntry.id, 'hostId'], null)
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

        this.setModel((model) => ({
          hosts: setIn(model.hosts, [host.id], host),
          settings: setIn(model.settings, ['hosts', hostSettingsEntry.id, 'hostId'], host.id)
        }));

        backend.onUpdate(() => {
          console.log('New state ->', backend!.state);

          this.setModel((model) => ({
            hosts: setIn(model.hosts, [host.id, 'state'], backend!.state)
          }));
        });

        backend.closed
          .catch((err) => {
            console.error(`Backend of host '${host.id}' terminated with error: ${err.message ?? err}`);
            console.error(err);
          })
          .finally(() => {
            this.setModel((model) => ({
              hosts: removeIn(model.hosts, [host.id]),
              settings: setIn(model.settings, ['hosts', hostSettingsEntry.id, 'hostId'], null)
            }));
          });
      })();
    }
  }

  componentDidMount() {
    super.componentDidMount();

    window.addEventListener('beforeunload', () => {
      for (let host of Object.values(this.state.model.hosts)) {
        host.backend.close();
      }
    }, { signal: this.controller.signal });
  }

  componentWillUnmount() {
    super.componentWillUnmount();
    this.controller.abort();
  }

  render() {
    return (
      <>
        {super.render()}
        {!this.state.model.doneInitializing && (
          <HostCreator
            onCancel={() => {
              this.setModel({ doneInitializing: true });
            }}
            onDone={({ backend, settings: hostSettingsEntry }) => {
              let host = {
                backend,
                id: backend.state.info.id,
                state: backend.state
              };

              this.setModel((model) => ({
                hosts: setIn(model.hosts, [host.id], host),
                settings: setIn(model.settings, ['hosts', hostSettingsEntry.id], { ...hostSettingsEntry, hostId: host.id }),
                doneInitializing: true
              }));

              backend.onUpdate(() => {
                this.setModel((model) => ({
                  hosts: setIn(model.hosts, [host.id, 'state'], backend.state)
                }));
              });
            }} />
        )}
      </>
    );
  }
}


export default function createClient(element: Element, options: {
  settings: Settings;
  saveSettings?(settings: Settings): void;
}) {
  ReactDOM.render(
    <App initialSettings={options.settings} />,
    // <HostCreator localAvailable={true} />,
    element
  );
}
