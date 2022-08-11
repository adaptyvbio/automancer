import { HostState } from './common';
import { RawMessageBackend } from './raw-message';
import * as util from '../util';
import { Deferred } from '../util';


export type InboundMessage = {
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


export abstract class MessageBackend extends RawMessageBackend {
  protected _notify(_message: string): void { };
  protected abstract _send(message: unknown): Promise<void>;
  protected abstract _start(listener: (message: InboundMessage) => void): Promise<void>;


  #nextRequestId = 0;
  #requests = new Map<number, Deferred<unknown>>();
  #sessions = new Map<TerminalSession['id'], TerminalSession>();

  async start() {
    let deferred: Deferred<void> | null = util.defer();

    let listener = (message: InboundMessage) => {
      switch (message.type) {
        case 'state': {
          this.state = {
            ...this.state,
            ...message.data
          };

          if (deferred !== null) {
            deferred.resolve();
          } else {
            this._update();
          }

          break;
        }

        case 'response': {
          this.#requests.get(message.id)?.resolve(message.data);
          this.#requests.delete(message.id);

          break;
        }

        case 'app.notification': {
          this._notify(message.message);
          break;
        }

        case 'app.session.close': {
          this.#sessions.get(message.id)?._handleClose(message.status);
          this.#sessions.delete(message.id);

          break;
        }

        case 'app.session.data': {
          this.#sessions.get(message.id)?._handleChunk(new Uint8Array(message.data));
          break;
        }
      }
    };

    await this._start(listener);
    await deferred.promise;
    deferred = null;
  }

  protected async _request(request: unknown) {
    let id = this.#nextRequestId++;
    let deferred = util.defer<unknown>();

    this.#requests.set(id, deferred);

    await this._send({
      type: 'request',
      id,
      data: request
    });

    return await deferred.promise;
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
