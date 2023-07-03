import { Client } from 'pr1-shared';
import { Component } from 'react';

import type { AppBackend } from './app-backends/base';
import { BrowserAppBackend } from './app-backends/browser';
import { Application } from './application';
import { HostInfoId } from './interfaces/host';
import { Pool } from './util';
import { WebsocketBackend } from './websocket';


export interface BrowserAppProps {

}

export interface BrowserAppState {
  client: Client | null;
}

export class BrowserApp extends Component<BrowserAppProps, BrowserAppState> {
  appBackend: AppBackend = new BrowserAppBackend();
  pool = new Pool();

  constructor(props: BrowserAppProps) {
    super(props);

    this.state = {
      client: null
    };
  }

  override componentDidMount() {
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

  override render() {
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
          description: '192.168.1.18:4235',
          label: 'Setup',
          local: false
        }} />
    );
  }
}
