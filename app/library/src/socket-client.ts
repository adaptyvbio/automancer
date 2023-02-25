import assert from 'assert';
import crypto from 'crypto';
import net from 'net';
import tls from 'tls';

import * as Protocol from './protocol';
import { Deferred, defer } from './util';


export class SocketClientClosed extends Error {

}

function createErrorWithCode(message: string, code: string) {
  let err = new Error(message);

  // @ts-expect-error
  err.code = code;

  return err;
}


export type SocketClientBackendOptions = {
  host: string;
  port: number;
} | {
  path: string;
};

export class SocketClientBackend {
  private _buffer: Buffer | null = null;
  private _closedDeferred: Deferred<boolean> = defer();
  private _closedUser: boolean = false;
  private _recvDeferred: Deferred<void> | null = null;
  private _socket!: net.Socket;

  closed: Promise<boolean> = this._closedDeferred.promise;
  isClosed: boolean = false;
  ready: Promise<void>;

  constructor(options: {
    address: SocketClientBackendOptions;
    tls: {
      clientAuth: null;
      serverAuth: {
        type: 'any' | 'system';
      } | {
        type: 'fingerprint';
        fingerprint: string;
      };
    } | null;
  }) {
    this.ready = new Promise((resolve, reject) => {
      if (options.tls) {
        let tlsOptions = options.tls;

        this._socket = tls.connect({
          ...options.address,
          rejectUnauthorized: (tlsOptions.serverAuth.type === 'system')
        }, () => {
          if ((tlsOptions.serverAuth.type === 'fingerprint') && (this.getServerCertificateFingerprint() !== tlsOptions.serverAuth.fingerprint)) {
            reject(createErrorWithCode('Invalid fingerprint', 'APP_FINGERPRINT_MISMATCH'));
            this._socket.destroy();
          } else {
            resolve();
          }
        });
      } else {
        this._socket = net.createConnection(options.address, () => {
          resolve();
        });
      }

      this._socket.on('error', (err) => {
        // TODO: Handle errors after this.ready
        // console.log('err', err);
        reject(err);
      });

      this._socket.on('end', () => {
        this._closedDeferred.resolve(this._closedUser);
        this.isClosed = true;

        if (this._recvDeferred) {
          this._recvDeferred.reject(new SocketClientClosed());
        }
      });

      this._socket.on('data', (chunk) => {
        this._buffer = this._buffer
          ? Buffer.concat([this._buffer, chunk])
          : chunk;

        if (this._recvDeferred) {
          this._recvDeferred.resolve();
          this._recvDeferred = null;
        }
      });
    });
  }

  getServerCertificateFingerprint() {
    assert(this._socket instanceof tls.TLSSocket);

    let certificate = this._socket.getPeerCertificate();
    let fingerprint = crypto.createHash('sha256').update(certificate.raw).digest('hex');

    return fingerprint;
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


export class MessageSocketClientBackend extends SocketClientBackend {
  // @ts-expect-error
  override async * [Symbol.asyncIterator]() {
    let contents = '';

    try {
      for await (let chunk of super[Symbol.asyncIterator]()) {
        contents += chunk.toString();

        let msgs = contents.split('\n');
        contents = msgs.at(-1)!;

        for (let msg of msgs.slice(0, -1)) {
          let message;

          try {
            message = JSON.parse(msg) as Protocol.Server.Message;
          } catch (err) {
            if (err instanceof SyntaxError) {
              throw createErrorWithCode('Malformed message', 'APP_MALFORMED');
            }

            throw err;
          }

          yield message;
        }
      }
    } catch (err) {
      if (!(err instanceof SocketClientClosed)) {
        throw err;
      }
    }
  }
}

export class SocketClient extends MessageSocketClientBackend {
  private _nextRequestId = 0;
  private _requests = new Map<number, Deferred<unknown>>();

  async initialize() {
    let createProtocolError = () => createErrorWithCode('Invalid message', 'APP_PROTOCOL');

    let iterator = this[Symbol.asyncIterator]();
    let item = await iterator.next();

    if (item.done || item.value.type !== 'initialize') {
      throw createProtocolError();
    }

    return {
      identifier: item.value.identifier,
      version: item.value.version
    };
  }

  async start() {
    try {
      for await (let message of this) {
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
    } catch (err: any) {
      await this.close();
      throw err;
    } finally {
      for (let request of this._requests.values()) {
        request.reject(new SocketClientClosed());
      }

      this._requests.clear();
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


  static async test(options: SocketClientBackendOptions) {
    let client = new SocketClient({
      address: options,
      tls: {
        clientAuth: null,
        serverAuth: {
          type: 'any'
        }
      }
    });

    try {
      await client.ready;
    } catch (err: any) {
      console.log('=>', err.code);

      switch (err.code) {
        case 'DEPTH_ZERO_SELF_SIGNED_CERT':
          return {
            ok: false,
            reason: 'unauthorized'
          } as const;
        case 'ECONNREFUSED':
          return {
            ok: false,
            reason: 'refused'
          } as const;
        case 'ERR_SOCKET_BAD_PORT':
          return {
            ok: false,
            reason: 'invalid_parameters'
          } as const;
/*         case 'APP_FINGERPRINT_MISMATCH':
          return {
            ok: false,
            reason: 'compromised'
          } */
        default:
          throw err;
      }
    }

    let initializationResult;

    try {
      initializationResult = await client.initialize();
    } catch (err: any) {
      switch (err.code) {
        case 'APP_PROTOCOL':
          return {
            ok: false,
            reason: 'protocol'
          }
      }
    } finally {
      await client.close();
    }

    // try {
    //   await client.recv();
    // } catch (e) {
    //   console.log(e)
    // }

    return {
      ok: true,
      ...initializationResult,
      serverCertificateFingerprint: client.getServerCertificateFingerprint()
    } as const;
  }
}
