import { Deferred, defer } from './defer';
import { createErrorWithCode } from './error';
import { Brand } from './types/util';
import { HostIdentifier, HostState } from './types/host';
import { ClientProtocol, RequestFunc, ServerProtocol } from './types/protocol';


export type ClientId = Brand<string, 'ClientId'>;


export type ChannelId = Brand<number, 'ChannelId'>;

export interface ChannelData {
  deferred: Deferred<void> | null;
  queue: unknown[];
}

export interface Channel<InboundMessage, OutboundMessage> extends AsyncIterable<InboundMessage> {
  close(): void;
  send(data: OutboundMessage): void;
}


export interface ClientBackend {
  close(): void;
  closed: Promise<void>;
  messages: AsyncIterator<ServerProtocol.Message>;
  send(message: ClientProtocol.Message): void;
}

export class Client {
  private channels = new Map<ChannelId, ChannelData>;
  private closedDeferred = defer<void>();
  private messageCallback: ((message: ServerProtocol.Message) => void) | null = null;
  private nextRequestId = 0x10000;
  private requests = new Map<number, Deferred<unknown>>();
  private userClose: (() => Promise<void>) | null;
  private userClosing = false;

  info: {
    clientId: ClientId;
    identifier: HostIdentifier | null,
    staticUrl: string | null,
    version: number | null
  } | null = null;

  initializationData: Omit<ServerProtocol.InitializationMessage, 'type'> | null = null;
  state: HostState | null = null;

  /** @deprecated */
  identifier: HostIdentifier | null = null;

  /** @deprecated */
  staticUrl: string | null = null;

  /** @deprecated */
  version: number | null = null;

  constructor(private backend: ClientBackend, options?: {
    close?(): Promise<void>;
  }) {
    this.userClose = (options?.close ?? null);
  }

  close() {
    if (this.userClose) {
      this.closedDeferred.resolve(this.userClose());
      this.userClosing = true;
    } else {
      this.backend.close();
    }
  }

  get closed() {
    return (async () => {
      await Promise.race([
        this.backend.closed,
        this.closedDeferred.promise
      ]);

      if (this.userClosing) {
        await this.closedDeferred.promise;
      }
    })();
  }

  listen<InboundMessage, OutboundMessage>(channelId: ChannelId): Channel<InboundMessage, OutboundMessage> {
    if (this.channels.has(channelId)) {
      throw new Error(`Already listening on channel ${channelId}`);
    }

    let channelData: ChannelData = {
      deferred: null,
      queue: []
    };

    this.channels.set(channelId, channelData);

    return {
      async * [Symbol.asyncIterator]() {
        while (true) {
          if (channelData.queue.length < 1) {
            if (!channelData.deferred) {
              channelData.deferred = defer();
            }

            await channelData.deferred.promise;
          }

          yield channelData.queue.pop() as InboundMessage;
        }
      },
      close: () => {
        this.channels.delete(channelId);
      },
      send: (data: OutboundMessage) => {
        this.backend.send({
          type: 'channel',
          id: channelId,
          data
        });
      }
    };
  }

  async initialize() {
    let initializationMessage: ServerProtocol.InitializationMessage;
    let stateMessage: ServerProtocol.StateMessage;

    try {
      let createProtocolError = () => createErrorWithCode('Invalid message', 'APP_PROTOCOL');

      let messages = this.backend.messages;
      let item1 = await messages.next();

      if (item1.done || (item1.value.type !== 'initialize')) {
        throw createProtocolError();
      }

      initializationMessage = item1.value;

      let item2 = await messages.next();

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

    this.info = {
      clientId: initializationMessage.clientId,
      identifier: initializationMessage.identifier,
      staticUrl: initializationMessage.staticUrl,
      version: initializationMessage.version
    };

    this.initializationData = initializationMessage;
    this.state = stateMessage.data;

    return {
      ok: true,
      identifier: initializationMessage.identifier,
      name: stateMessage.data.info.name,
      staticUrl: initializationMessage.staticUrl,
      version: initializationMessage.version
    } as const;
  }

  onMessage(callback: ((message: ServerProtocol.Message) => void)) {
    this.messageCallback = callback;
  }

  request: RequestFunc = async (data: unknown) => {
    let requestId = this.nextRequestId++;
    let deferred = defer<unknown>();

    this.requests.set(requestId, deferred);

    this.backend.send({
      type: 'request',
      id: requestId,
      data
    });

    return (await deferred.promise) as any;
  }

  sendRawMessage(message: ClientProtocol.Message) {
    this.backend.send(message);
  }

  async start() {
    try {
      for await (let message of { [Symbol.asyncIterator]: () => this.backend.messages }) {
        switch (message.type) {
          case 'channel': {
            let channelData = this.channels.get(message.id);

            if (channelData) {
              channelData.queue.push(message.data);

              if (channelData.deferred) {
                channelData.deferred.resolve();
                channelData.deferred = null;
              }
            }

            break;
          }

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
