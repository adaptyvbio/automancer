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
import ViewTree from './views/tree';
import WebsocketBackend from './backends/websocket';
import { BackendCommon, HostId, HostState } from './backends/common';

import '../lib/styles.css';


export { BackendCommon };

export interface Host {
  backend: BackendCommon;
  id: HostId;
  state: HostState;
}

export interface Environment {
  head: App;
}

export interface HostSettingsEntry {
  id: string;
  builtin: boolean;
  disabled: boolean;
  hostId: HostId | null;
  locked: boolean;
  name: string | null;

  location: {
    type: 'remote';
    address: string;
    secure: boolean;
  } | {
    type: 'internal';
    Backend: { new(): BackendCommon; };
  } | {
    type: 'inactive'
  };
}

export interface Settings {
  defaultHostId: HostId | null;
  hosts: Record<string, HostSettingsEntry>;
}

export interface Model {
  hosts: Record<HostId, Host>;
  settings: Settings;
}

export interface AppProps {
  initialSettings: Settings;
}

class App extends Rf.Application<Model, {}, AppProps> {
  constructor(props: AppProps) {
    super({
      layout: FragmentPaneRecord({
        horizontal: true,
        cuts: List([0.65]),
        panes: List([
          ViewPaneRecord({ view: 'blank' }),
          ViewPaneRecord({ view: 'blank' })
          // ViewPaneRecord({ view: 'chip-settings' }),
          // ViewPaneRecord({ view: 'tree' })
        ])
      }),
      model: {
        hosts: {},
        settings: props.initialSettings
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
  }

  updateHostLocation(hostSettings: HostSettingsEntry) {
    if (hostSettings.hostId) {
      this.setModel((model) => ({
        hosts: removeIn(model.hosts, [hostSettings.hostId]),
        settings: setIn(model.settings, ['hosts', hostSettings.id, 'hostId'], null)
      }));
    }

    let backend = (() => {
      switch (hostSettings.location.type) {
        case 'internal': return new hostSettings.location.Backend();
        case 'remote': return new WebsocketBackend({
          address: hostSettings.location.address,
          secure: hostSettings.location.secure
        });
      }
    })();

    if (backend) {
      (async () => {
        await backend.start();

        console.log('Initial state ->', backend.state);

        let host = {
          backend,
          id: backend.state.info.id,
          state: backend.state
        };

        this.setModel((model) => ({
          hosts: setIn(model.hosts, [host.id], host),
          settings: setIn(model.settings, ['hosts', hostSettings.id, 'hostId'], host.id)
        }));

        backend.onUpdate(() => {
          console.log('New state ->', backend!.state);

          this.setModel((model) => ({
            hosts: setIn(model.hosts, [host.id, 'state'], backend!.state)
          }));
        });
      })();
    }
  }
}


export default function createClient(element: Element, options: {
  settings: Settings;
}) {
  ReactDOM.render(
    <App initialSettings={options.settings} />,
    element
  );
}
