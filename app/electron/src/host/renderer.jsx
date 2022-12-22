import { Application, MessageBackend, Pool, React, ReactDOM } from 'pr1';
import { NativeContextMenuProvider } from '../shared/context-menu';


let root = ReactDOM.createRoot(document.getElementById('root'));


class ElectronAppBackend {
  #draftListeners;

  constructor() {
    this.#draftListeners = new Set();
  }

  async initialize() {

  }

  async createDraft(options) {
    let draftEntry = await window.api.drafts.create(options.source);

    if (!draftEntry) {
      return null;
    }

    return new DraftItem(draftEntry);
  }

  async deleteDraft(draftId) {
    await window.api.drafts.delete(draftId);
  }

  async listDrafts() {
    return (await window.api.drafts.list()).map((draftEntry) => new DraftItem(draftEntry));
  }

  async loadDraft(options) {
    let draftEntry = await window.api.drafts.load();

    if (!draftEntry) {
      return null;
    }

    return new DraftItem(draftEntry);
  }


  async createBackend(options) {
    if (options.type === 'local') {
      return new LocalHostBackend({ hostSettingsId: options.id });
    }

    return null;
  }
}


class DraftItem {
  kind = 'own';
  readable = true;
  readonly = false;
  revision = 0;
  source = null;
  volumeInfo = null;
  writable = true;

  constructor(draftEntry) {
    this._entry = draftEntry;

    this.lastModified = draftEntry.lastModified;
  }

  get id() {
    return this._entry.id;
  }

  get locationInfo() {
    return {
      type: 'file',
      name: this.mainFilePath
    };
  }

  get mainFilePath() {
    return this._entry.path;
  }

  get name() {
    return this._entry.name;
  }


  async openFile(filePath) {
    await window.api.drafts.openFile(this._entry.id, filePath);
  }

  async revealFile(filePath) {
    await window.api.drafts.revealFile(this._entry.id, filePath);
  }

  async watch(handler, options) {
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


class App extends React.Component {
  pool = new Pool();

  constructor(props) {
    super(props);

    this.appBackend = new ElectronAppBackend();
    this.backend = null;
    this.hostSettingsId = new URL(location).searchParams.get('hostSettingsId');

    this.state = {
      hostSettings: null
    };
  }

  componentDidMount() {
    this.pool.add(async () => {
      let { hostSettings: hostSettingsCollection } = await window.api.hostSettings.query();
      let hostSettings = hostSettingsCollection[this.hostSettingsId];

      this.setState({ hostSettings });
      this.backend = new LocalHostBackend(hostSettings);
    });
  }

  render() {
    if (!this.state.hostSettings) {
      return <div />;
    }

    return (
      <NativeContextMenuProvider>
        <Application
          appBackend={this.appBackend}
          backend={this.backend}
          hostSettingsLabel={this.state.hostSettings.label}
          onHostStarted={() => {
            window.api.ready();
          }} />
      </NativeContextMenuProvider>
    );
  }
}

root.render(<App />);


class LocalHostBackend extends MessageBackend {
  constructor(hostSettings) {
    super();

    this.closed = new Promise(() => {});
    this.hostSettings = hostSettings;
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
