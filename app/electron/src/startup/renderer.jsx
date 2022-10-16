import { Pool, React, ReactDOM, Startup } from 'pr1';

import { NativeContextMenuProvider } from '../shared/context-menu';


class App extends React.Component {
  pool = new Pool();

  constructor(props) {
    super(props);

    this.state = {
      defaultHostSettingsId: props.defaultHostSettingsId,
      hostSettings: props.hostSettings
    };
  }

  componentDidMount() {
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

  render() {
    if (!this.state.hostSettings) {
      return null;
    }

    return (
      <NativeContextMenuProvider>
        <Startup
          defaultSettingsId={this.state.defaultHostSettingsId}
          hostSettings={this.state.hostSettings}

          createHostSettings={(options) => {
            this.pool.add(async () => {
              await window.api.hostSettings.create({ hostSettings: options.settings });
              await this.query();
            });
          }}
          deleteHostSettings={(hostSettingsId) => {
            this.pool.add(async () => {
              await window.api.hostSettings.delete({ hostSettingsId });
              await this.query();
            });
          }}
          launchHost={(settingsId) => {
            window.api.launchHost(settingsId);
          }}
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


let root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
