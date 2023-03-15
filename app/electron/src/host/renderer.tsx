import { AppBackend, Application, DraftId, HostInfoId, MessageBackend, Pool, React, ReactDOM } from 'pr1';

import { NativeContextMenuProvider } from '../shared/context-menu';


class ElectronAppBackend implements AppBackend {
  async initialize() {

  }

  async createDraft(options: { directory: boolean; source: string; }) {
    let draftEntry = await window.api.drafts.create(options.source);

    if (!draftEntry) {
      return null;
    }

    return new DraftItem(draftEntry);
  }

  async deleteDraft(draftId: DraftId) {
    await window.api.drafts.delete(draftId);
  }

  async listDrafts() {
    return (await window.api.drafts.list()).map((draftEntry) => new DraftItem(draftEntry));
  }

  async loadDraft(options: { directory: boolean; }) {
    let draftEntry = await window.api.drafts.load();

    if (!draftEntry) {
      return null;
    }

    return new DraftItem(draftEntry);
  }
}


class DraftItem {
  kind = 'own' as const;
  lastModified: number;
  readable = true;
  readonly = false;
  revision = 0;
  source: string | null = null;
  volumeInfo = null;
  writable = true;

  constructor(private _entry: DraftEntry) {
    this.lastModified = this._entry.lastModified;
  }

  get id() {
    return this._entry.id;
  }

  get locationInfo() {
    return {
      type: 'file' as const,
      name: this.mainFilePath
    };
  }

  get mainFilePath() {
    return this._entry.path;
  }

  get name() {
    return this._entry.name;
  }


  async openFile(filePath: string) {
    await window.api.drafts.openFile(this._entry.id, filePath);
  }

  async revealFile(filePath: string) {
    await window.api.drafts.revealFile(this._entry.id, filePath);
  }

  async watch(handler: () => void, options: { signal: AbortSignal; }) {
    await window.api.drafts.watch(this._entry.id, (change) => {
      this.lastModified = change.lastModified;
      this.revision = change.lastModified;
      this.source = change.source;

      handler();
    }, (listener) => {
      options.signal.addEventListener('abort', listener);
    });
  }

  async write(primitive) {
    let lastModified = await window.api.drafts.write(this._entry.id, primitive);

    if (lastModified !== null) {
      this.lastModified = lastModified;
      this.source = primitive.source;
    }
  }
}


interface AppProps {

}

interface AppState {
  hostSettings: HostSettings | null;
}

class App extends React.Component<AppProps, AppState> {
  appBackend = new ElectronAppBackend();
  backend: LocalHostBackend | null = null;
  hostSettingsId = new URL(location.href).searchParams.get('hostSettingsId') as HostSettingsId;
  pool = new Pool();

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

      this.setState({ hostSettings });
      this.backend = new LocalHostBackend(hostSettings);
    });
  }

  override render() {
    if (!this.state.hostSettings) {
      return <div />;
    }

    return (
      <NativeContextMenuProvider>
        <Application
          appBackend={this.appBackend}
          backend={this.backend!}
          hostInfo={{
            id: (this.state.hostSettings.id as string as HostInfoId),
            imageUrl: null,
            description: this.state.hostSettings.label,
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


let root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);


class LocalHostBackend extends MessageBackend {
  closed = new Promise<void>(() => {});

  constructor(private hostSettings: HostSettings) {
    super();
  }

  async _start(listener) {
    window.api.localHost.onMessage((message) => {
      listener(message);
    });

    await window.api.localHost.ready(this.hostSettings.id);
  }

  async _send(message) {
    window.api.localHost.sendMessage(this.hostSettings.id, message);
  }

  async loadUnit(unitInfo) {
    let url = new URL(`./${unitInfo.namespace}/${unitInfo.version}/index.js?${Date.now()}`, 'http://localhost:4568');
    return await import(url.href);
  }
}
