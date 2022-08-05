import * as React from 'react';

import type { AppBackend } from './app-backends/base';
import { BrowserAppBackend } from './app-backends/browser';
import { Application } from './application';
import type { Host, HostSettings, HostSettingsRecord } from './host';
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
          hostSettings={this.state.hostSettings[this.state.currentSettingsId]}
          hostSettingsRecord={this.state.hostSettings}
          key={this.state.currentSettingsId} />
      );
    }

    return (
      <Startup
        createHostSettings={({ settings }) => {
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
          this.setState({ currentSettingsId: settingsId });
        }} />
    );
  }
}
