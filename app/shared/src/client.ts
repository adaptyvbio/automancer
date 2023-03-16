import { Deferred, defer } from './defer';
import { createErrorWithCode } from './error';
import { ServerProtocol, ClientProtocol, HostIdentifier, HostState } from './index';


export interface ClientBackend {
  close(): void;
  closed: Promise<void>;
  messages: AsyncIterable<ServerProtocol.Message>;
  send(message: ClientProtocol.Message): void;
}

export class Client {
  private messageCallback: ((message: ServerProtocol.Message) => void) | null = null;
  private nextRequestId = 0x10000;
  private requests = new Map<number, Deferred<unknown>>();

  identifier: HostIdentifier | null = null;
  state: HostState | null = null;
  version: number | null = null;

  constructor(private backend: ClientBackend) {

  }

  close() {
    this.backend.close();
  }

  get closed() {
    return this.backend.closed;
  }

  async initialize() {
    let initializationMessage: ServerProtocol.InitializationMessage;
    let stateMessage: ServerProtocol.StateMessage;

    try {
      let createProtocolError = () => createErrorWithCode('Invalid message', 'APP_PROTOCOL');

      let iterator = this.backend.messages[Symbol.asyncIterator]();
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

    this.identifier = initializationMessage.identifier;
    this.state = stateMessage.data;
    this.version = initializationMessage.version;

    return {
      ok: true,
      identifier: initializationMessage.identifier,
      name: stateMessage.data.info.name,
      version: initializationMessage.version
    } as const;
  }

  onMessage(callback: ((message: ServerProtocol.Message) => void)) {
    this.messageCallback = callback;
  }

  async request<T extends ServerProtocol.ResponseMessage['data']>(data: ClientProtocol.RequestMessage['data']): Promise<T> {
    let requestId = this.nextRequestId++;
    let deferred = defer<unknown>();

    this.requests.set(requestId, deferred);

    this.backend.send({
      id: requestId,
      type: 'request',
      data
    });

    return (await deferred.promise) as T;
  }

  sendRawMessage(message: ClientProtocol.Message) {
    this.backend.send(message);
  }

  async start() {
    try {
      for await (let message of this.backend.messages) {
        switch (message.type) {
          case 'response': {
            let request = this.requests.get(message.id);

            if (request) {
              request.resolve(message.data);
              this.requests.delete(message.id);
            }

            break;
          }

          case 'state': {
            this.state = {
              ...this.state,
              ...message.data
            };

            break;
          }
        }

        this.messageCallback?.(message);
      }
    } finally {
      for (let request of this.requests.values()) {
        request.reject(createErrorWithCode('Closed', 'APP_CLOSED'));
      }

      this.requests.clear();
    }
  }
}
