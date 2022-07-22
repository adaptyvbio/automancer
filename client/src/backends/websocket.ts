import { HostState } from './common';
import { MessageBackend } from './message';
import type { Deferred } from '../util';
import * as util from '../util';


interface Options {
  address: string;
  port: number;
  secure: boolean;
}

type InboundMessage = {
  type: 'state';
  data: HostState;
} | {
  type: 'response';
  id: number;
  data: unknown;
} | {
  type: 'app.notification';
  message: string;
} | {
  type: 'app.session.close';
  id: string;
  status: number;
} | {
  type: 'app.session.data';
  id: string;
  data: number[];
};

export default class WebsocketBackend extends MessageBackend {
  readonly version = 1;

  #nextRequestId = 0;
  #options: Options;
  #transport!: WebSocketTransport;
  #requests: Record<number, Deferred<unknown>> = {};
  #sessions: Record<TerminalSession['id'], TerminalSession> = {};

  closed!: Promise<void>;
  state!: HostState;

  constructor(options: Options) {
    super();

    this.#options = options;
  }

  protected async _request(request: unknown) {
    let id = this.#nextRequestId++;
    let deferred = util.defer<unknown>();
    this.#requests[id] = deferred;

    this.#transport.send({
      type: 'request',
      id,
      data: request
    });

    return await deferred.promise;
  }

  async close() {
    await this.#transport.close();
  }

  async start() {
    this.#transport = new WebSocketTransport(`${this.#options.secure ? 'wss' : 'ws'}://${this.#options.address}:${this.#options.port}`);

    let handleState = (state: HostState) => {
      this.state = state;
      this._update();
    };

    await this.#transport.listen(async (conn) => {
      let iter = conn.iter();

      let initMessage = (await iter.next()).value;

      if (initMessage.authMethods) {
        await this.#transport.send({
          authMethodIndex: 0,
          data: { password: 'foobar' }
        });

        let authResultMessage = (await iter.next()).value;

        if (!authResultMessage.ok) {
          throw new Error('Authentication not ok');
        }
      }

      let stateMessage = (await iter.next()).value;

      handleState(stateMessage.data);
    });

    this.closed = this.#transport.listen(async (conn) => {
      for await (let message of conn.iter<InboundMessage>()) {
        switch (message.type) {
          case 'state': {
            handleState(message.data);

            break;
          }

          case 'response': {
            this.#requests[message.id].resolve(message.data);
            delete this.#requests[message.id];
            break;
          }

          case 'app.notification': {
            new Notification(message.message);
            break;
          }

          case 'app.session.close': {
            this.#sessions[message.id]._handleClose(message.status);
            break;
          }

          case 'app.session.data': {
            this.#sessions[message.id]._handleChunk(new Uint8Array(message.data));
            break;
          }
        }
      }
    });
  }


  async createSession(options: { size: TerminalSessionSize; }): Promise<TerminalSession> {
    let { id } = await this._request({
      type: 'app.session.create',
      size: options.size
    }) as { id: string; };

    let chunkDeferred!: Deferred<Uint8Array>;
    let closedDeferred = util.defer<{ status: number; }>();

    let session = {
      id,
      close: async () => {
        await this._request({
          type: 'app.session.close',
          id
        });
      },
      closed: closedDeferred.promise,
      resize: async (size: TerminalSessionSize) => {
        await this._request({
          type: 'app.session.resize',
          id,
          size
        })
      },
      write: async (chunk: Uint8Array) => {
        await this._request({
          type: 'app.session.data',
          id,
          data: Array.from(chunk)
        });
      },

      [Symbol.asyncIterator]() {
        return {
          async next() {
            chunkDeferred = util.defer<Uint8Array>();

            return await Promise.race([
              closedDeferred.promise.then(() => ({ done: true, value: undefined as unknown as Uint8Array })),
              chunkDeferred.promise.then((value) => ({ done: false, value }))
            ]);
          }
        };
      },

      _handleChunk: (chunk: Uint8Array) => {
        chunkDeferred.resolve(chunk);
      },
      _handleClose: (status: number) => {
        closedDeferred.resolve({ status });
      }
    };

    this.#sessions[session.id] = session;

    return session;
  }
}


export type TerminalSession = AsyncIterable<Uint8Array> & {
  id: string;
  close(): Promise<void>;
  closed: Promise<{ status: number; }>;
  resize(size: TerminalSessionSize): Promise<void>;
  write(chunk: Uint8Array): Promise<void>;

  _handleChunk(chunk: Uint8Array): void;
  _handleClose(status: number): void;
}

export interface TerminalSessionSize {
  columns: number;
  rows: number;
}


export class WebSocketTransport {
  readonly #socket: WebSocket;

  readonly closed: Promise<void>;
  readonly ready: Promise<void>;

  constructor(url: string, options?: { signal?: AbortSignal; }) {
    this.#socket = new WebSocket(url);

    let readyDeferred = util.defer();
    this.ready = readyDeferred.promise;

    let closedDeferred = util.defer();
    this.closed = closedDeferred.promise;

    let ready = false;

    this.#socket.addEventListener('open', () => {
      ready = true;
      readyDeferred.resolve();
    }, { once: true });

    this.#socket.addEventListener('close', (event) => {
      if (event.code === 1000) {
        closedDeferred.resolve();
      } else {
        let err = new Error(`Closed with code ${event.code}`);

        if (ready) {
          closedDeferred.reject(err);
        } else {
          readyDeferred.reject(err);
        }
      }
    });

    options?.signal?.addEventListener('abort', () => {
      this.#socket.close(1000);
    });
  }

  async close(options?: { error: boolean; }) {
    this.#socket.close(options?.error ? 4000 : 1000);
    await this.closed;
  }


  iter<T>(): AsyncIterator<T> & AsyncIterable<T> {
    let controller = new AbortController();
    let messageDeferred!: Deferred<T>;

    this.#socket.addEventListener('message', (event) => {
      if (!messageDeferred) {
        return;
      }

      let message!: T;

      try {
        message = JSON.parse(event.data);
      } catch (err) {
        messageDeferred.reject(new Error('Invalid message'));
        this.#socket.close(4000);

        return;
      }

      messageDeferred.resolve(message);
    }, { signal: controller.signal });

    let iter = {
      next: async () => {
        messageDeferred = util.defer<T>();

        return await Promise.race([
          this.closed.then(() => ({ done: true, value: undefined as unknown as T })),
          messageDeferred.promise.then((value) => ({ done: false, value }))
        ]);
      },
      return: async () => {
        controller.abort();
        return { done: true, value: undefined as unknown as T };
      }
    };

    return {
      ...iter,
      [Symbol.asyncIterator]: () => iter
    };
  }

  async send(message: unknown) {
    this.#socket.send(JSON.stringify(message));
  }

  async listen<T = void>(func: (conn: { iter: WebSocketTransport['iter']; }) => Promise<T>): Promise<T> {
    await this.ready;

    try {
      return await func({
        iter: () => this.iter()
      });
    } catch (err) {
      this.#socket.close(4000);
      throw err;
    }
  }
}
