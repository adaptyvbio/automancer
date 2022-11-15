import ModernWebsocket from 'modern-websocket';

import { HostState } from './common';
import { InboundMessage, MessageBackend } from './message';
import type { Deferred } from '../util';
import * as util from '../util';
import { HostRemoteBackendOptions } from '../host';
import { Unit, UnitInfo } from '../units';


interface WebsocketBackendInfo {
  features: {
    terminal: boolean;
  };
  staticUrl: string;
}

export default class WebsocketBackend extends MessageBackend {
  #options: HostRemoteBackendOptions;
  #socket!: ModernWebsocket;

  closed!: Promise<void>;
  info!: WebsocketBackendInfo;
  state!: HostState;

  constructor(options: HostRemoteBackendOptions) {
    super();
    this.#options = options;
  }

  async close() {
    await this.#socket.close();
  }

  async loadUnit(unitInfo: UnitInfo): Promise<Unit<unknown, unknown>> {
    let url = new URL(`./${unitInfo.namespace}/${unitInfo.version}/index.js?${Date.now()}`, this.info.staticUrl);
    let imported = await import(url.href);

    return imported.default ?? imported;
  }

  protected async _send(message: unknown) {
    this.#socket.send(JSON.stringify(message));
  }

  protected async _start(listener: (message: InboundMessage) => void) {
    this.#socket = new ModernWebsocket(`${this.#options.secure ? 'wss' : 'ws'}://${this.#options.address}:${this.#options.port}`);

    await this.#socket.listen(async (conn) => {
      let iter = conn.iter();
      let initMessage = JSON.parse((await iter.next()).value);

      this.info = initMessage;

      if (initMessage.authMethods) {
        let authResultMessage;

        if (this.#options.auth) {
          this.#socket.send(JSON.stringify({
            authMethodIndex: this.#options.auth.methodIndex,
            data: { password: this.#options.auth.password }
          }));

          authResultMessage = JSON.parse((await iter.next()).value);
        } else {
          authResultMessage = null;
        }

        if (!authResultMessage?.ok) {
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


  static async test(options: HostRemoteBackendOptions): Promise<(
    { ok: true;
      identifier: string;
      label: string; }
  | { ok: false;
      reason: 'unauthorized'; }
  | { ok: false;
      reason: 'invalid_auth';
      message: string | null; }
  | { ok: false;
      reason: 'unknown';
      message: string | null; }
  )> {
    try {
      let socket = new ModernWebsocket(`${options.secure ? 'wss' : 'ws'}://${options.address}:${options.port}`);

      return await socket.listen(async (conn) => {
        let iter = conn.iter();
        let initMessage = JSON.parse((await iter.next()).value);

        if (initMessage.authMethods) {
          if (!options.auth) {
            return {
              ok: false,
              reason: 'unauthorized'
            };
          }

          socket.send(JSON.stringify({
            authMethodIndex: options.auth.methodIndex,
            data: {
              password: options.auth.password
            }
          }));

          let resultMessage = JSON.parse((await iter.next()).value);

          if (!resultMessage.ok) {
            return {
              ok: false,
              reason: 'invalid_auth',
              message: resultMessage.message
            };
          }
        }

        let stateMessage = JSON.parse((await iter.next()).value);

        return {
          ok: true,
          identifier: initMessage.identifier,
          label: stateMessage.data.info.name
        };
      });
    } catch (err) {
      return {
        ok: false,
        reason: 'unknown',
        message: (err as { message: string; }).message ?? null
      };
    }
  }
}
