import { Application, MessageBackend, React, ReactDOM, Startup } from 'pr1-client';
import 'pr1-client/dist/index.css';


let root = ReactDOM.createRoot(document.getElementById('root'));


class ElectronAppBackend {
  #draftListeners;

  constructor() {
    this.#draftListeners = new Set();
  }

  async initialize() {

  }

  async loadDraft() {
    await window.api.drafts.load();
    this._triggerDraftsUpdate({ options: { skipCompilation: true }, update: { [newDraftEntry.id]: createDraftItem(newDraftEntry) } });

    return newDraftEntry.id;
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
