import * as net from 'net';

import { Deferred, defer } from './util';


export class SocketClientClosed extends Error {

}

export class SocketClientBackend {
  closed: Promise<boolean>;
  isClosed: boolean;
  ready: Promise<void>;

  private _buffer: Buffer | null;
  private _closedDeferred: Deferred<boolean>;
  private _closedUser: boolean;
  private _recvDeferred: Deferred<void> | null;
  private _socket!: net.Socket;

  constructor(options: any) {
    this.ready = new Promise((resolve, reject) => {
      this._socket = net.createConnection(options, () => {
        resolve();
      });

      this._socket.on('error', (err) => {
        // TODO: Handle errors after this.ready
        // console.log('err', err);
        reject(err);
      });
    });

    this._socket.on('end', () => {
      this._closedDeferred.resolve(this._closedUser);
      this.isClosed = true;

      if (this._recvDeferred) {
        this._recvDeferred.reject(new SocketClientClosed());
      }
    });

    this._recvDeferred = null;
    this._buffer = null;

    this._closedDeferred = defer();
    this._closedUser = false;
    this.closed = this._closedDeferred.promise;
    this.isClosed = false;

    this._socket.on('data', (chunk) => {
      this._buffer = this._buffer
        ? Buffer.concat([this._buffer, chunk])
        : chunk;

      if (this._recvDeferred) {
        this._recvDeferred.resolve();
        this._recvDeferred = null;
      }
    });
  }

  async close() {
    this._closedUser = true;
    this._socket.end();

    await this.closed;
  }

  async recv() {
    if (!this._buffer) {
      if (!this._recvDeferred) {
        this._recvDeferred = defer();
      }

      await this._recvDeferred.promise;
    }

    let buffer = this._buffer!;
    this._buffer = null;

    return buffer;
  }

  async send(buffer: Buffer) {
    this._socket.write(buffer);
  }

  async * [Symbol.asyncIterator]() {
    while (true) {
      try {
        yield await this.recv();
      } catch (err) {
        if (err instanceof SocketClientClosed) {
          return;
        }

        throw err;
      }
    }
  }
}


export class SocketClient extends SocketClientBackend {
  private _nextRequestId = 0;
  private _requests = new Map<number, Deferred<unknown>>();

  async start() {
    let contents = '';

    try {
      for await (let chunk of this) {
        contents += chunk.toString();

        let msgs = contents.split('\n');
        contents = msgs.at(-1)!;

        for (let msg of msgs.slice(0, -1)) {
          let message = JSON.parse(msg);

          switch (message.type) {
            case 'response': {
              let request = this._requests.get(message.id);

              if (request) {
                request.resolve(message.data);
                this._requests.delete(message.id);
              }
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof SocketClientClosed) {
        for (let request of this._requests.values()) {
          request.reject(err);
        }

        this._requests.clear();
      } else {
        throw err;
      }
    }
  }

  override async send(data: unknown) {
    super.send(Buffer.from(JSON.stringify(data) + '\n'));
  }

  async request(data: unknown) {
    let requestId = this._nextRequestId++;
    let deferred = defer<any>();

    this._requests.set(requestId, deferred);

    this.send({
      id: requestId,
      type: 'request',
      data
    });

    return await deferred.promise;
  }


  static async test(options: any) {
    let client = new SocketClientBackend(options);

    try {
      await client.ready;
    } catch (err: any) {
      if (err.code === 'ECONNREFUSED') {
        return false;
      }

      throw err;
    }

    await client.close();
    return true;
  }
}
