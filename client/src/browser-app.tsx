import * as React from 'react';

import { AppBackend } from './app-backends/base';
import { BrowserAppBackend } from './app-backends/browser';
import { Application, Host, HostSettings, HostSettingsRecord } from './application';
import { createBackend, HostId } from './backends/common';
import { Startup } from './startup';
import { Pool } from './util';


interface BrowserAppState {
  currentSettingsId: string | null;
  hostSettings: HostSettingsRecord | null;
}

export class BrowserApp extends React.Component<{}, BrowserAppState> {
  appBackend: AppBackend;
  pool = new Pool();

  constructor(props: {}) {
    super(props);

    this.appBackend = new BrowserAppBackend();

    this.state = {
      currentSettingsId: null,
      hostSettings: null
    };
  }

  componentDidMount() {
    this.pool.add(async () => {
      this.setState({
        hostSettings: await this.appBackend.getHostSettings()
      });
    });
  }

  render() {
    if (!this.state.hostSettings) {
      return <div />;
    }

    if (this.state.currentSettingsId) {
      return (
        <Application
          appBackend={this.appBackend}
          settingsId={this.state.currentSettingsId} />
      );
    }

    return (
      <Startup
        createHostSettings={({ backend, settings }) => {
          this.pool.add(async () => {
            await this.appBackend.setHostSettings(settings);
          });

          this.setState({
            hostSettings: {
              ...this.state.hostSettings,
              [settings.id]: settings
            }
          });
        }}
        deleteHostSettings={(settingsId) => {
          this.pool.add(async () => {
            await this.appBackend.deleteHostSettings(settingsId);
          });

          let { [settingsId]: _, ...hostSettings } = this.state.hostSettings!;
          this.setState({ hostSettings });
        }}
        hostSettings={this.state.hostSettings}

        launchHost={(settingsId) => {
          let hostSettings = this.state.hostSettings![settingsId];
          let backend = createBackend(hostSettings.backendOptions);

          this.setState({
            currentSettingsId: settingsId
          });
        }} />
    );
  }
}
