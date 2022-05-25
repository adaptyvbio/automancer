import { HostState } from './common';
import { MessageBackend } from './message';


interface Options {
  address: string;
  port: number;
  secure: boolean;
}

export default class WebsocketBackend extends MessageBackend {
  #options: Options;
  #socket!: WebSocket;
  state!: HostState; // ?

  constructor(options: Options) {
    super();

    this.#options = options;
  }

  protected _send(message: unknown) {
    this.#socket.send(JSON.stringify(message));
  }

  async start() {
    this.#socket = new WebSocket(`${this.#options.secure ? 'wss' : 'ws'}://${this.#options.address}:${this.#options.port}`, 'alpha');

    let initialController = new AbortController();
    let promise = new Promise<void>((resolve, reject) => {
      this.#socket.addEventListener('open', () => {
        resolve();
      }, { signal: initialController.signal });

      this.#socket.addEventListener('error', (err) => {
        reject(new Error());
      }, { signal: initialController.signal });
    });

    promise.finally(() => {
      initialController.abort();
    });

    await promise;


    let controller = new AbortController();

    await new Promise<void>((resolve) => {
      this.#socket.addEventListener('message', (event) => {
        let data = JSON.parse(event.data);

        this.state = data;
        this._update();

        resolve();
      }, { signal: controller.signal });
    });

    controller.abort();

    this.#socket.addEventListener('message', (event) => {
      let data = JSON.parse(event.data);

      this.state = data;
      this._update();
    });

    // this.#socket.addEventListener('close', (event) => {
    //   if (event.code === 1006) {
    //     setTimeout(() => {
    //       this.start();
    //     }, 1000);
    //   }
    // });
  }
}
