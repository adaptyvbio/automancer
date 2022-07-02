import createClient, { MessageBackend } from 'pr1-client';

import 'pr1-client/dist/index.css';


class LowMessageBackend extends MessageBackend {
  #nextRequestId = 0;
  #requests = {};

  constructor() {
    super();

    this.closed = new Promise(() => {});
  }

  async start() {
    let deferred = defer();

    let listener = (message) => {
      switch (message.type) {
        case 'state': {
          this.state = message.data;

          if (deferred !== null) {
            deferred.resolve();
          } else {
            this._update();
          }

          break;
        }

        case 'response': {
          this.#requests[message.id].resolve(message.data);
          delete this.#requests[message.id];
          break;
        }
      }
    };

    await this._start(listener);
    await deferred.promise;
    deferred = null;
  }

  async _request(request) {
    let id = this.#nextRequestId++;
    let deferred = defer();
    this.#requests[id] = deferred;

    this._send({
      type: 'request',
      id,
      data: request
    });

    return await deferred.promise;
  }
}

class Backend extends LowMessageBackend {
  async _start(listener) {
    window.backendAPI.onMessage((message) => {
      listener(message);
    });

    window.backendAPI.ready();
  }

  async _send(message) {
    window.backendAPI.sendMessage(message);
  }
}

let id = crypto.randomUUID();

createClient(document.querySelector('#root'), {
  settings: {
    hosts: {
      [id]: {
        id,
        builtin: true,
        disabled: false,
        hostId: null,
        locked: false,
        name: 'Local host',
        backendOptions: {
          type: 'internal',
          Backend
        }
      }
    }
  }
});


function defer() {
  let resolve, reject;

  let promise = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });

  return { promise, resolve, reject };
}
