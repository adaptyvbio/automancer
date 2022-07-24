import ModernWebsocket from 'modern-websocket';


import { HostState } from './common';
import { InboundMessage, MessageBackend } from './message';
import type { Deferred } from '../util';
import * as util from '../util';


interface Options {
  address: string;
  port: number;
  secure: boolean;
}

export default class WebsocketBackend extends MessageBackend {
  #options: Options;
  #socket!: ModernWebsocket;

  closed!: Promise<void>;
  state!: HostState;

  constructor(options: Options) {
    super();
    this.#options = options;
  }

  async close() {
    await this.#socket.close();
  }

  protected async _send(message: unknown) {
    this.#socket.send(JSON.stringify(message));
  }

  protected async _start(listener: (message: InboundMessage) => void) {
    this.#socket = new ModernWebsocket(`${this.#options.secure ? 'wss' : 'ws'}://${this.#options.address}:${this.#options.port}`);

    await this.#socket.listen(async (conn) => {
      let iter = conn.iter();
      let initMessage = JSON.parse((await iter.next()).value);

      if (initMessage.authMethods) {
        this.#socket.send(JSON.stringify({
          authMethodIndex: 0,
          data: { password: 'foobar' }
        }));

        let authResultMessage = JSON.parse((await iter.next()).value);

        if (!authResultMessage.ok) {
          throw new Error('Authentication not ok');
        }
      }

      let stateMessage = JSON.parse((await iter.next()).value);
      listener(stateMessage);
    });

    this.closed = this.#socket.listen(async (conn) => {
      for await (let msg of conn.iter<string>()) {
        listener(JSON.parse(msg));
      }
    });
  }
}
