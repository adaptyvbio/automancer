import { List } from 'immutable';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Application, FragmentPaneRecord, ViewBlank, ViewPaneRecord } from 'retroflex';

import ViewChipSettings from './views/chip-settings';
import ViewControl from './views/control';
import ViewProtocolEditor from './views/protocol-editor';
import ViewTree from './views/tree';
import WebsocketBackend from './backends/websocket';
import { BackendCommon, HostId, HostState } from './backends/common';


export interface Host {
  backend: BackendCommon;
  id: HostId;
  state: HostState;
}

export interface Model {
  hosts: Record<HostId, Host>;
}

class App extends React.Component {
  ref: React.RefObject<Application<Model>> = React.createRef();

  componentDidMount() {
    let app = this.ref.current!;

    app.setModel({
      hosts: {}
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
      icon: null,
      component: ViewChipSettings,
      shortcut: null
    });

    app.registerViewModel({
      id: 'protocol-editor',
      name: 'Protocol editor',
      groupId: 'protocol',
      icon: null,
      component: ViewProtocolEditor,
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
        cuts: List([0.4, 0.75]),
        panes: List([
          ViewPaneRecord({ view: 'protocol-editor' }),
          ViewPaneRecord({ view: 'chip-settings' }),
          ViewPaneRecord({ view: 'tree' })
        ])
      })
    });


    let addHost = async () => {
      let backend = new WebsocketBackend();
      await backend.start();

      console.log('Initial state ->', backend.state);

      app.setModel({
        hosts: {
          [backend.state.info.id]: {
            backend,
            id: backend.state.info.id,
            state: backend.state
          }
        }
      });

      backend.onUpdate(() => {
        console.log('New state ->', backend.state);

        app.setModel({
          hosts: {
            ...app.state.model.hosts,
            [backend.state.info.id]: {
              ...app.state.model.hosts[backend.state.info.id],
              state: backend.state
            }
          }
        });
      });
    };

    addHost();
  }

  render() {
    return <Application ref={this.ref} />;
  }
}


ReactDOM.render(
  <App />,
  document.querySelector('#root')
);
