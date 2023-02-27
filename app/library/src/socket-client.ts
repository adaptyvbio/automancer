import assert from 'assert';
import crypto from 'crypto';
import net from 'net';
import tls from 'tls';

import * as Protocol from './protocol';
import { Brand, defer, Deferred } from './util';


export type CertificateFingerprint = Brand<string, 'CertificateFingerprint'>;


export class SocketClientClosed extends Error {

}

function createErrorWithCode(message: string, code: string) {
  let err = new Error(message);

  // @ts-expect-error
  err.code = code;

  return err;
}


export interface SocketClientBackendOptions {
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

export class SocketClientBackend {
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

  constructor(options: SocketClientBackendOptions) {
    this.ready = new Promise((resolve, reject) => {
      if (options.tls) {
        let tlsOptions = options.tls;

        let socket = tls.connect({
          ...options.address,
          rejectUnauthorized: false
          // ca: `-----BEGIN CERTIFICATE-----\nMIIFAjCCAuqgAwIBAgIJRTN+9VMgfeulMA0GCSqGSIb3DQEBDQUAMBQxEjAQBgNVBAMMCWxvY2FsaG9zdDAeFw0yMzAyMjYwMzMwMTJaFw0zMzAyMjMwMzMwMTJaMBQxEjAQBgNVBAMMCWxvY2FsaG9zdDCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBALB5gO/HaQNT1MZB92Fk/65IvTEBQsTFXCWvFPwG6yvtPcCsxkjRyptVScOcaqviDY+TZt8IRb7hwQCDg/I0D6cGNyMF5CobQ++1xGd2bLMvCngdtKGjYz1xzWXzxO0i7waTLWkpJQsMM3YVpy4GOlXNbNYBfdLLU2pvXveE33ulU0suDJHqs+xg5ZeV0uvQGxdVTjYGn4cB9q2sDhwt+NtcSuoesjz7FC1W9eF6YGCQF95Oz0iLZJ3jLr7hbWh3Jtuo9HXHkC9+iaXmak7oqCpatVFVK3PHA37rdCoJ34UkhMI7Jqi+VPqvrMWmKH6dgNPlxfLlylEQPwXE1vlg6TVNGSj47J9t3iEHvziI9GaWfh7PZiwzY+j4DXwVrl8UdjsTCRpB24FTd0dJW357eeULxnYE2GdTJ5LRwKHaNhGDCOT0Imci9k/xd14LifMguaE6CqFkG0dpJH2sI6vi6HP67TQJfCZ7oROkvJ9Ywza2X33aYJ3Gh5zZeH3ntwDsPhecn2rhyXJZuMKyR9qUlHRHlK6la4ilI745GPMZQL55EhFuU6kIZhPeeT5OTgBbwLDgDIXgGyMbvJXmFTKq4mQM3KqmegUSrqegtM+ncsjHXa1dSOToHhEw74Mwq1AFpRjFp4ViuA+cDHGnKz7Egve0BrAcFtXKXellM8wG+NT7AgMBAAGjVzBVMBoGA1UdEQQTMBGCCWxvY2FsaG9zdIcEfwAAATAPBgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIHgDAWBgNVHSUBAf8EDDAKBggrBgEFBQcDATANBgkqhkiG9w0BAQ0FAAOCAgEAFVJomC5tGE1GkPAKu7mVd/dFIi7WUF7xU2+QIC4v1GOcKVq9F7lRq64qOjHwl72WSuPt/mXNBdsVoFmwTgmVjLBPlCd1Vpd1GrRs0WQ4R0hG9GYZE3/DbsuDIfo/OW/grpPbr7Zq6G036d5sq92xvqdKfLSZy47ZxIYPv5m9S52259NIYOtgp3nTdn1r0Y9hVjhLOJiJk0cpClJ7r9/JI7i2g35cCIG2q/IH1oLamTSHUkio/Fo4AeMAWrWDzAPlaow4AmpWqhzxu96sYK7TgqpYnFZXHxPPW1Cef+kFxIc6PnHAV8RJwayH247Os39wg3QnXRFdVAC8T1sSWeUrcEn1RqG87EwEcmzGKqaEGklAzTVuMR6+joM94+bxHk0k2EkRx1Og/iTKXHe5SXqyKy8jFFTxYxD7omM3/Pw3U6adSiI4rNBGaYK7sLYd7ew7Q2BDEDrnlCryJ9+M8mkrkytU7yQKXx6H498CKET53VpA+ikH8v9BPMgWK7PNg2Oxr5NmX0BjKYxMDoa724Xvm7JdfRUD5jJdhC4tPgVwdkgVO4xqxeAVMxdM03pu8sj6XY9rZ4F0oHz+eoAFCHdkxg/icutYdqia2ASyJvSQ9PTI8VHQEj8+lbau0z9pY8MGVe+Y8hhYe0OZhKyBksJc/p1IygOUarZ7r5fFxnbWHwg=\n-----END CERTIFICATE-----`,
          // servername: 'localhost',
          // checkServerIdentity(servername, cert) {
          //   console.log('CHECK', servername, cert)
          //   return undefined;
          // }
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
    try {
      await this.ready;
    } catch (err: any) {
      switch (err.code) {
        case 'APP_UNTRUSTED_CERT':
          return {
            ok: false,
            reason: 'untrusted_server',
            tlsInfo: this.tlsInfo!
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
        case 'APP_FINGERPRINT_MISMATCH':
          return {
            ok: false,
            reason: 'fingerprint_mismatch'
          } as const;
        default:
          throw err;
      }
    }

    let initializationMessage;
    let stateMessage;

    try {
      let createProtocolError = () => createErrorWithCode('Invalid message', 'APP_PROTOCOL');

      let iterator = this[Symbol.asyncIterator]();
      let item1 = await iterator.next();

      if (item1.done || item1.value.type !== 'initialize') {
        throw createProtocolError();
      }

      initializationMessage = item1.value;

      let item2 = await iterator.next();

      if (item2.done || item2.value.type !== 'state') {
        throw createProtocolError();
      }

      stateMessage = item2.value;
    } catch (err: any) {
      await this.close();

      switch (err.code) {
        case 'APP_PROTOCOL':
          return {
            ok: false,
            reason: 'invalid_protocol',
            tlsInfo: this.tlsInfo
          } as const;
        default:
          throw err;
      }
    }

    return {
      ok: true,
      identifier: initializationMessage.identifier,
      name: stateMessage.data['info'].name as string,
      tlsInfo: this.tlsInfo,
      version: initializationMessage.version
    } as const;
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
    let client = new SocketClient(options);
    let result = await client.initialize();

    if (result.ok) {
      await client.close();
    }

    return result;
  }
}
