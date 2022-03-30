import { List } from 'immutable';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Application, FragmentPaneRecord, ViewBlank, ViewPaneRecord } from 'retroflex';

import ViewChipSettings from './views/chip-settings';
import ViewControl from './views/control';
import ViewTree from './views/tree';
import WebsocketBackend from './backends/websocket';
import { BackendCommon, HostState } from './backends/common';


export interface Host {
  backend: BackendCommon;
  state: HostState;
}

export interface Model {
  hosts: Record<string, Host>;
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
      component: ViewTree as any,
      shortcut: 'T'
    });

    app.registerViewModel({
      id: 'control',
      name: 'Control',
      groupId: 'general',
      icon: 'toggle-on',
      component: ViewControl as any,
      shortcut: 'C'
    });

    app.registerViewModel({
      id: 'chip-settings',
      name: 'Chip settings',
      groupId: 'general',
      icon: null,
      component: ViewChipSettings as any,
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
        cuts: List([0.4, 0.7]),
        panes: List([
          ViewPaneRecord({ view: 'control' }),
          ViewPaneRecord({ view: 'tree' }),
          ViewPaneRecord({ view: 'chip-settings' })
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
