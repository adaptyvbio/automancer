import { Application, HostInfoId, Pool } from 'pr1';
import { HostSettings, HostSettingsId } from 'pr1-library';
import { Client, Deferred, ServerProtocol, defer } from 'pr1-shared';
import { createRoot } from 'react-dom/client';
import { Component } from 'react';

import { NativeContextMenuProvider } from '../shared/context-menu';
import { ElectronAppBackend } from './app-backend';


export interface AppProps {

}

export interface AppState {
  hostSettings: HostSettings | null;
}

export class App extends Component<AppProps, AppState> {
  private appBackend = new ElectronAppBackend();
  private client: Client | null = null;
  private hostSettingsId = new URL(location.href).searchParams.get('hostSettingsId') as HostSettingsId;
  private pool = new Pool();

  constructor(props: AppProps) {
    super(props);

    this.state = {
      hostSettings: null
    };
  }

  override componentDidMount() {
    this.pool.add(async () => {
      let { hostSettingsRecord } = await window.api.hostSettings.list();
      let hostSettings = hostSettingsRecord[this.hostSettingsId];

      this.client = await createLocalClient(hostSettings);
      this.setState({ hostSettings });
    })
  }

  override render() {
    if (!this.state.hostSettings) {
      return <div />;
    }

    return (
      <NativeContextMenuProvider>
        <Application
          appBackend={this.appBackend}
          client={this.client!}
          hostInfo={{
            id: (this.state.hostSettings.id as string as HostInfoId),
            imageUrl: null,
            description: null,
            label: this.state.hostSettings.label,
            local: true
          }}
          onHostStarted={() => {
            window.api.main.ready();
          }} />
      </NativeContextMenuProvider>
    );
  }
}


document.body.dataset['platform'] = window.api.platform;

let root = createRoot(document.getElementById('root')!);
root.render(<App />);


async function createLocalClient(hostSettings: HostSettings) {
  let messageDeferred: Deferred<void> | null = null;
  let messageQueue: ServerProtocol.Message[] = [];

  let client = new Client({
    close: () => {},
    closed: new Promise(() => {}),
    messages: (async function* () {
      while (true) {
        if (messageQueue.length < 1) {
          messageDeferred = defer();
          await messageDeferred.promise;
        }

        yield messageQueue.shift()!;
      }
    })(),
    send: (message) => void window.api.host.sendMessage(hostSettings.id, message)
  });

  window.api.host.onMessage((message) => {
    messageQueue.push(message);

    if (messageDeferred) {
      messageDeferred.resolve();
      messageDeferred = null;
    }
  });

  let initialization = client.initialize();

  await window.api.host.ready(hostSettings.id);
  let result = await initialization;

  if (!result.ok) {
    throw new Error('Failed to connect to local client');
  }

  return client;
}
