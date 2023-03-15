import { HostState } from 'pr1';

import { ClientProtocol, ServerProtocol } from './protocol';
import { createErrorWithCode, defer, Deferred } from './util';


export async function* splitMessagesOfIterator(iterable: AsyncIterable<Buffer>) {
  let contents = '';

  for await (let chunk of iterable) {
    contents += chunk.toString();

    let msgs = contents.split('\n');
    contents = msgs.at(-1)!;

    yield* msgs.slice(0, -1);
  }
}


export function serializeMessage(message: ClientProtocol.Message) {
  return Buffer.from(JSON.stringify(message) + '\n');
}

export async function* deserializeMessagesOfIterator(iterable: AsyncIterable<string>, options?: { handleMalformed?(msg: string): boolean; }) {
  for await (let msg of iterable) {
    let message;

    try {
      message = JSON.parse(msg) as ServerProtocol.Message;
    } catch (err) {
      if (!options?.handleMalformed?.(msg) && (err instanceof SyntaxError)) {
        throw createErrorWithCode('Malformed message', 'APP_MALFORMED');
      }

      throw err;
    }

    yield message;
  }
}


export interface ClientBackend {
  messages: AsyncIterable<ServerProtocol.Message>;
  send(message: ClientProtocol.Message): void;
}

export class Client {
  private _backend: ClientBackend;
  private _nextRequestId = 0;
  private _requests = new Map<number, Deferred<unknown>>();

  state: HostState | null = null;

  constructor(backend: ClientBackend) {
    this._backend = backend;
  }

  async initialize() {
    let initializationMessage: ServerProtocol.InitializationMessage;
    let stateMessage: ServerProtocol.StateMessage;

    try {
      let createProtocolError = () => createErrorWithCode('Invalid message', 'APP_PROTOCOL');

      let iterator = this._backend.messages[Symbol.asyncIterator]();
      let item1 = await iterator.next();

      if (item1.done || (item1.value.type !== 'initialize')) {
        throw createProtocolError();
      }

      initializationMessage = item1.value;

      let item2 = await iterator.next();

      if (item2.done || (item2.value.type !== 'state')) {
        throw createProtocolError();
      }

      stateMessage = item2.value;
    } catch (err: any) {
      switch (err.code) {
        case 'APP_PROTOCOL':
          return {
            ok: false,
            reason: 'invalid_protocol'
          } as const;
        default:
          throw err;
      }
    }

    this.state = stateMessage.data;

    return {
      ok: true,
      identifier: initializationMessage.identifier,
      name: stateMessage.data.info.name,
      version: initializationMessage.version
    } as const;
  }

  async request<T extends ServerProtocol.ResponseMessage['data']>(data: ClientProtocol.RequestMessage['data']): Promise<T> {
    let requestId = this._nextRequestId++;
    let deferred = defer<unknown>();

    this._requests.set(requestId, deferred);

    this._backend.send({
      id: requestId,
      type: 'request',
      data
    });

    return (await deferred.promise) as T;
  }

  async start() {
    try {
      for await (let message of this._backend.messages) {
        switch (message.type) {
          case 'response': {
            let request = this._requests.get(message.id);

            if (request) {
              request.resolve(message.data);
              this._requests.delete(message.id);
            }

            break;
          }

          case 'state': {
            this.state = message.data;
            break;
          }
        }
      }
    } finally {
      for (let request of this._requests.values()) {
        request.reject(new Error('Closed'));
      }

      this._requests.clear();
    }
  }
}
