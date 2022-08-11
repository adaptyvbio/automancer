import * as React from 'react';

import type { AppBackend } from './app-backends/base';
import { BrowserAppBackend } from './app-backends/browser';
import { Application } from './application';
import type { Host, HostSettingsData, HostSettingsRecord } from './host';
import { Startup } from './startup';
import { Pool } from './util';


interface BrowserAppState {
  currentSettingsId: string | null;
  hostSettingsData: HostSettingsData | null;
}

export class BrowserApp extends React.Component<{}, BrowserAppState> {
  appBackend: AppBackend;
  pool = new Pool();

  constructor(props: {}) {
    super(props);

    this.appBackend = new BrowserAppBackend();

    this.state = {
      currentSettingsId: null,
      hostSettingsData: null
    };
  }

  componentDidMount() {
    this.pool.add(async () => {
      let hostSettingsData = await this.appBackend.getHostSettingsData();

      this.setState({
        currentSettingsId: hostSettingsData.defaultHostSettingsId,
        hostSettingsData
      });
    });
  }

  render() {
    if (!this.state.hostSettingsData) {
      return <div />;
    }

    if (this.state.currentSettingsId) {
      return (
        <Application
          appBackend={this.appBackend}
          hostSettings={this.state.hostSettingsData.hosts[this.state.currentSettingsId]}
          hostSettingsRecord={this.state.hostSettingsData.hosts}
          key={this.state.currentSettingsId} />
      );
    }

    return (
      <Startup
        createHostSettings={({ settings }) => {
          this.pool.add(async () => {
            await this.appBackend.setHostSettings(settings);
          });

          this.setState((state) => ({
            hostSettingsData: {
              ...state.hostSettingsData!,
              hosts: {
                ...state.hostSettingsData!.hosts,
                [settings.id]: settings
              }
            }
          }));
        }}
        deleteHostSettings={(settingsId) => {
          this.pool.add(async () => {
            await this.appBackend.deleteHostSettings(settingsId);
          });

          let { [settingsId]: _, ...hostSettings } = this.state.hostSettingsData!.hosts;
          this.setState((state) => ({
            hostSettingsData: {
              ...state.hostSettingsData!,
              hosts: hostSettings
            }
          }));
        }}
        launchHost={(settingsId) => {
          this.setState({ currentSettingsId: settingsId });
        }}
        setDefaultHostSettings={(settingsId) => {
          this.pool.add(async () => {
            await this.appBackend.setDefaultHostSettings(settingsId);
          });

          this.setState((state) => ({
            hostSettingsData: {
              ...state.hostSettingsData!,
              defaultHostSettingsId: settingsId
            }
          }));
        }}

        defaultSettingsId={this.state.hostSettingsData!.defaultHostSettingsId}
        hostSettings={this.state.hostSettingsData!.hosts} />
    );
  }
}
