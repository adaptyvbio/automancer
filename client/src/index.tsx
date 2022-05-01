import { List, removeIn, setIn } from 'immutable';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Application, FragmentPaneRecord, ViewBlank, ViewPaneRecord } from 'retroflex';

import ViewChipSettings from './views/chip-settings';
import ViewControl from './views/control';
import ViewProtocolEditor from './views/protocol-editor';
import ViewProtocolRun from './views/protocol-run';
import ViewSettings from './views/settings';
import ViewTree from './views/tree';
import WebsocketBackend from './backends/websocket';
import { BackendCommon, HostId, HostState } from './backends/common';

import 'retroflex/tmp/styles.css';
import '../lib/styles.css';


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
    type: 'local';
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

class App extends React.Component<AppProps> {
  ref: React.RefObject<Application<Model, Environment>> = React.createRef();

  get app() {
    return this.ref.current!;
  }

  componentDidMount() {
    let app = this.ref.current!;

    for (let hostSettings of Object.values(this.props.initialSettings.hosts)) {
      this.updateHostLocation(hostSettings);
    }

    app.setModel({
      hosts: {},
      settings: this.props.initialSettings
    });

    app.registerViewGroup({
      id: 'general',
      name: 'General',
      compact: false
    });

    app.registerViewGroup({
      id: 'protocol',
      name: 'Protocol',
      compact: false
    });

    app.registerViewModel({
      id: 'blank',
      name: 'Blank',
      groupId: 'general',
      icon: 'apps',
      component: ViewBlank as any,
      shortcut: null
    });

    app.registerViewModel({
      id: 'tree',
      name: 'Tree',
      groupId: 'general',
      icon: 'account-tree',
      component: ViewTree,
      shortcut: 'T'
    });

    app.registerViewModel({
      id: 'control',
      name: 'Control',
      groupId: 'general',
      icon: 'toggle-on',
      component: ViewControl,
      shortcut: 'C'
    });

    app.registerViewModel({
      id: 'chip-settings',
      name: 'Chip settings',
      groupId: 'general',
      icon: 'tune',
      component: ViewChipSettings,
      shortcut: null
    });

    app.registerViewModel({
      id: 'settings',
      name: 'Settings',
      groupId: 'general',
      icon: 'settings',
      component: ViewSettings,
      shortcut: null
    });

    app.registerViewModel({
      id: 'protocol-editor',
      name: 'Protocol editor',
      groupId: 'protocol',
      icon: 'edit-note',
      component: ViewProtocolEditor,
      shortcut: null
    });

    app.registerViewModel({
      id: 'protocol-run',
      name: 'Protocol run',
      groupId: 'protocol',
      icon: 'receipt-long',
      component: ViewProtocolRun,
      shortcut: null
    });

    // app.registerView({
    //   id: 'tree',
    //   name: 'Tree',
    //   icon: 'memory',
    //   view: ViewTree
    // });

    app.setState({
      layout: FragmentPaneRecord({
        horizontal: true,
        cuts: List([0.65]),
        panes: List([
          ViewPaneRecord({ view: 'protocol-editor' }),
          ViewPaneRecord({ view: 'settings' })
          // ViewPaneRecord({ view: 'chip-settings' }),
          // ViewPaneRecord({ view: 'tree' })
        ])
      })
    });
  }

  updateHostLocation(hostSettings: HostSettingsEntry) {
    if (hostSettings.hostId) {
      this.app.setModel((model) => ({
        hosts: removeIn(model.hosts, [hostSettings.hostId]),
        settings: setIn(model.settings, ['hosts', hostSettings.id, 'hostId'], null)
      }));
    }

    if (hostSettings.location.type === 'remote') {
      let backend = new WebsocketBackend({
        address: hostSettings.location.address,
        secure: hostSettings.location.secure
      });

      (async () => {
        await backend.start();

        console.log('Initial state ->', backend.state);

        let host = {
          backend,
          id: backend.state.info.id,
          state: backend.state
        };

        this.app.setModel((model) => ({
          hosts: setIn(model.hosts, [host.id], host),
          settings: setIn(model.settings, ['hosts', hostSettings.id, 'hostId'], host.id)
        }));

        backend.onUpdate(() => {
          console.log('New state ->', backend.state);

          this.app.setModel((model) => ({
            hosts: setIn(model.hosts, [host.id, 'state'], backend.state)
          }));
        });
      })();
    }
  }

  render() {
    return <Application environment={{ head: this }} ref={this.ref} />;
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
