// import { ipcRenderer } from 'electron';
import { Pool, React, ReactDOM, Startup } from 'pr1';


let root = ReactDOM.createRoot(document.getElementById('root'));


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
        setDefaultHostSettings={(hostSettingsId) => {
          this.pool.add(async () => {
            await window.api.hostSettings.setDefault({ hostSettingsId });
            await this.query();
          });
        }} />
    );
  }
}


root.render(<App />);
