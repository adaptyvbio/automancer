import { Client } from 'pr1-shared';
import * as React from 'react';

import type { AppBackend } from './app-backends/base';
import { BrowserAppBackend } from './app-backends/browser';
import { Application } from './application';
import { WebsocketBackend } from './websocket';
import { HostInfoId } from './interfaces/host';
import { Pool } from './util';


export interface BrowserAppState {
  client: Client | null;
}

export class BrowserApp extends React.Component<{}, BrowserAppState> {
  appBackend: AppBackend = new BrowserAppBackend();
  pool = new Pool();

  constructor(props: {}) {
    super(props);

    this.state = {
      client: null
    };
  }

  componentDidMount() {
    this.pool.add(async () => {
      let backend = new WebsocketBackend('ws://localhost:4567');
      await backend.ready;

      let client = new Client(backend);
      let result = await client.initialize();

      if (result.ok) {
        this.setState({ client });
      } else {
        console.error('Not ok: ' + result.reason);
      }
    });
  }

  render() {
    if (!this.state.client) {
      return <div />;
    }

    return (
      <Application
        appBackend={this.appBackend}
        client={this.state.client}
        hostInfo={{
          id: ('_' as HostInfoId),
          imageUrl: null,
          description: 'localhost:4567',
          label: 'Setup',
          local: false
        }} />
    );
  }
}
