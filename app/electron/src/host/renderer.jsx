import { Application, MessageBackend, React, ReactDOM, Startup } from 'pr1-client';
import 'pr1-client/dist/index.css';


let root = ReactDOM.createRoot(document.getElementById('root'));


class ElectronAppBackend {
  #draftListeners;

  constructor() {
    this.#draftListeners = new Set();
  }

  async initialize() {
    let draftEntries = await window.api.drafts.list();

    this._triggerDraftsUpdate({
      options: { skipCompilation: false },
      update: Object.fromEntries(
        Object.values(draftEntries).map((draftEntry) => [draftEntry.id, createDraftItem(draftEntry)])
      )
    });
  }

  async createDraft(source) {
    let draftEntry = await window.api.drafts.create(source);

    if (!draftEntry) {
      return null;
    }

    this._triggerDraftsUpdate({
      options: { skipCompilation: false },
      update: { [draftEntry.id]: createDraftItem(draftEntry) }
    });

    return draftEntry.id;
  }

  async deleteDraft(draftId) {
    await window.api.drafts.delete(draftId);

    this._triggerDraftsUpdate({
      options: { skipCompilation: false },
      update: { [draftId]: null }
    });
  }

  async loadDraft() {
    let draftEntry = await window.api.drafts.load();

    if (!draftEntry) {
      return null;
    }

    this._triggerDraftsUpdate({
      options: { skipCompilation: true },
      update: { [draftEntry.id]: createDraftItem(draftEntry) }
    });

    return draftEntry.id;
  }

  async setDraft(draftId, primitive, options) {
    let draftEntry = await window.api.drafts.update(draftId, primitive);

    this._triggerDraftsUpdate({
      options,
      update: { [draftId]: createDraftItem(draftEntry) }
    });
  }

  onDraftsUpdate(listener, options) {
    this.#draftListeners.add(listener);

    options?.signal?.addEventListener('abort', () => {
      this.#draftListeners.delete(listener);
    });
  }

  _triggerDraftsUpdate(event) {
    for (let listener of this.#draftListeners) {
      listener(event);
    }
  }

  async createBackend(options) {
    if (options.type === 'internal') {
      return new InternalBackend();
    }

    return null;
  }
}

function createDraftItem(draftEntry) {
  return {
    id: draftEntry.id,
    name: draftEntry.name,
    kind: 'ref',
    lastModified: null,
    getMainFile: async () => {
      return await window.api.drafts.getSource(draftEntry.id);
    },
    locationInfo: {
      type: 'file',
      name: draftEntry.path
    }
  };
}


class App extends React.Component {
  constructor(props) {
    super(props);

    this.appBackend = new ElectronAppBackend();
    this.hostSettingsId = new URL(location).searchParams.get('hostSettingsId');

    this.state = {
      hostSettings: null
    };
  }

  componentDidMount() {
    window.api.getHostSettings().then((hostSettings) => {
      this.setState({ hostSettings }, () => {
        window.api.ready();
      });
    });
  }

  render() {
    if (!this.state.hostSettings) {
      return <div />;
    }
    console.log('ok')

    return (
      <Application
        appBackend={this.appBackend}
        hostSettings={this.state.hostSettings[this.hostSettingsId]}
        hostSettingsRecord={this.state.hostSettings} />
    );
  }
}

root.render(<App />);


class InternalBackend extends MessageBackend {
  constructor() {
    super();

    this.closed = new Promise(() => {});
  }

  async _start(listener) {
    window.api.internalHost.onMessage((message) => {
      listener(message);
    });

    await window.api.internalHost.ready();
  }

  async _send(message) {
    window.api.internalHost.sendMessage(message);
  }
}
