import crypto from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import { Deferred, defer, createErrorWithCode, ClientProtocol, Client } from 'pr1-shared';

import { CertificateFingerprint } from './types/app-data';
import { deserializeMessagesOfIterator, serializeMessage, splitMessagesOfIterator } from './client';


export class OrdinarySocketClientClosedError extends Error {

}


export interface OrdinarySocketClientOptions {
  address: {
    host: string;
    port: number;
  } | {
    path: string;
  };
  tls: {
    serverCertificateCheck: boolean;
    serverCertificateFingerprint: CertificateFingerprint | null;
  } | null;
}

export class OrdinarySocketClient {
  private _buffer: Buffer | null = null;
  private _closedDeferred: Deferred<boolean> = defer();
  private _closedUser: boolean = false;
  private _recvDeferred: Deferred<void> | null = null;
  private _socket!: net.Socket;

  closed: Promise<boolean> = this._closedDeferred.promise;
  isClosed: boolean = false;
  ready: Promise<void>;
  tlsInfo!: {
    certificate: tls.PeerCertificate;
    fingerprint: CertificateFingerprint;
    trusted: boolean;
  } | null;

  constructor(options: OrdinarySocketClientOptions) {
    this.ready = new Promise((resolve, reject) => {
      if (options.tls) {
        let tlsOptions = options.tls;

        let socket = tls.connect({
          ...options.address,
          rejectUnauthorized: false
        }, () => {
          let certificate = socket.getPeerCertificate();
          let fingerprint = crypto
            .createHash('sha256')
            .update(certificate.raw)
            .digest('hex') as CertificateFingerprint;

          this.tlsInfo = {
            certificate,
            fingerprint,
            trusted: socket.authorized
          };

          if (tlsOptions.serverCertificateCheck && !socket.authorized) {
            resolve(this.close().then(() => { throw createErrorWithCode('Invalid fingerprint', 'APP_UNTRUSTED_CERT'); }));
          } else if (tlsOptions.serverCertificateFingerprint && (fingerprint !== tlsOptions.serverCertificateFingerprint)) {
            resolve(this.close().then(() => { throw createErrorWithCode('Invalid fingerprint', 'APP_FINGERPRINT_MISMATCH'); }));
          } else {
            resolve();
          }
        });

        this._socket = socket;
      } else {
        this._socket = net.createConnection(options.address, () => {
          this.tlsInfo = null;
          resolve();
        });
      }

      this._socket.on('error', (err: any) => {
        // TODO: Handle errors after this.ready
        reject(err)
      });

      this._socket.on('end', () => {
        this._closedDeferred.resolve(this._closedUser);
        this.isClosed = true;

        if (this._recvDeferred) {
          this._recvDeferred.reject(new OrdinarySocketClientClosedError());
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
        if (err instanceof OrdinarySocketClientClosedError) {
          return;
        }

        throw err;
      }
    }
  }
}


export class SocketClientBackend {
  private options: OrdinarySocketClientOptions;
  private socket!: OrdinarySocketClient;

  constructor(options: OrdinarySocketClientOptions) {
    this.options = options;
  }

  async close() {
    await this.socket.close();
  }

  async open(): Promise<any> {
    this.socket = new OrdinarySocketClient(this.options);

    try {
      await this.socket.ready;
    } catch (err: any) {
      switch (err.code) {
        case 'APP_UNTRUSTED_CERT':
          return {
            ok: false,
            reason: 'untrusted_server',
            tlsInfo: this.socket.tlsInfo!
          } as const;
        case 'ECONNREFUSED':
        case 'ENOENT':
          return {
            ok: false,
            reason: 'refused'
          } as const;
        case 'ERR_SOCKET_BAD_PORT':
          return {
            ok: false,
            reason: 'invalid_parameters'
          } as const;
        case 'APP_FINGERPRINT_MISMATCH':
          return {
            ok: false,
            reason: 'fingerprint_mismatch'
          } as const;
        default:
          throw err;
      }
    }

    let messages = deserializeMessagesOfIterator(splitMessagesOfIterator(this.socket));

    let client = new Client({
      close: () => void this.close(),
      closed: this.socket.closed.then(() => {}),
      messages,
      send: (message: ClientProtocol.Message) => void this.socket.send(serializeMessage(message))
    });

    let result = await client.initialize();

    if (!result.ok) {
      await this.socket.close();
    }

    return {
      ...result,
      client,
      tlsInfo: this.socket.tlsInfo
    };
  }

  async send(message: ClientProtocol.Message) {
    this.socket.send(serializeMessage(message));
  }


  static async test(options: OrdinarySocketClientOptions) {
    let backend = new SocketClientBackend(options);
    let result = await backend.open();

    if (result.ok) {
      await backend.close();

      let { client: _, ...partialResult } = result;
      return partialResult;
    }

    return result;
  }
}
