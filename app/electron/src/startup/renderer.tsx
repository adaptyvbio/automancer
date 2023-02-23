import { HostSettingsCollection, HostSettingsId, Pool, React, ReactDOM, Startup } from 'pr1';

import { HostCreator } from './host-creator';
import { NativeContextMenuProvider } from '../shared/context-menu';


export interface AppProps {

}

export interface AppState {
  defaultHostSettingsId: HostSettingsId | null;
  hostSettings: HostSettingsCollection | null;
}

export class App extends React.Component<AppProps, AppState> {
  pool = new Pool();

  constructor(props: AppProps) {
    super(props);

    this.state = {
      defaultHostSettingsId: null,
      hostSettings: null
    };
  }

  override componentDidMount() {
    this.pool.add(async () => {
      await this.query();
      await window.api.ready();
    });
  }

  async query() {
    let { defaultHostSettingsId, hostSettings } = await window.api.hostSettings.query();

    this.setState({
      defaultHostSettingsId,
      hostSettings
    });
  }

  override render() {
    if (!this.state.hostSettings) {
      return null;
    }

    return (
      <NativeContextMenuProvider>
        <Startup
          defaultSettingsId={this.state.defaultHostSettingsId}
          hostSettings={this.state.hostSettings}

          // createHostSettings={(options) => {
          //   this.pool.add(async () => {
          //     await window.api.hostSettings.create({ hostSettings: options.settings });
          //     await this.query();
          //   });
          // }}
          deleteHostSettings={(hostSettingsId) => {
            this.pool.add(async () => {
              await window.api.hostSettings.delete({ hostSettingsId });
              await this.query();
            });
          }}
          launchHost={(hostSettingsId) => {
            window.api.launchHost({ hostSettingsId });
          }}
          renderHostCreator={({ close }) => (
            <HostCreator
              close={close}
              update={async () => void await this.query()} />
          )}
          revealHostLogsDirectory={(hostSettingsId) => {
            window.api.hostSettings.revealLogsDirectory({ hostSettingsId });
          }}
          revealHostSettingsDirectory={(hostSettingsId) => {
            window.api.hostSettings.revealSettingsDirectory({ hostSettingsId });
          }}
          setDefaultHostSettings={(hostSettingsId) => {
            this.pool.add(async () => {
              await window.api.hostSettings.setDefault({ hostSettingsId });
              await this.query();
            });
          }} />
      </NativeContextMenuProvider>
    );
  }
}


if (!window.common.isDarwin) {
  let sheet = window.document.styleSheets[0];

  sheet.insertRule(`
    .startup-right-root {
      padding-top: 3rem;
    }
  `, sheet.cssRules.length);
}


let root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);
