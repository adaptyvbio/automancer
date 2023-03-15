import { Brand } from './util';


export type HostIdentifier = Brand<string, 'HostIdentifier'>;

export type TcpHostOptions = {
  hostname: string;
  identifier: HostIdentifier;
  password: string | null;
  port: number;
} & ({
  secure: false;
} | {
  fingerprint: CertificateFingerprint;
  secure: true;
  trusted: boolean;
});

export type TcpHostOptionsCandidate = {
  hostname: string;
  identifier: HostIdentifier | null;
  password: string | null;
  port: number;
} & ({
  secure: false;
} | {
  fingerprint: CertificateFingerprint | null;
  secure: true;
  trusted: boolean;
});


export type CertificateFingerprint = Brand<string, 'CertificateFingerprint'>;


export interface ServerConfiguration {
  advertisement: {
    description: string;
  } | null;
  auth: null;
  bridges: ({
    type: 'socket';
    options: {
      type: 'inet';
      hostname: string;
      port: number;
    } | {
      type: 'unix';
      path: string;
    };
  } | {
    type: 'stdio';
    options: {};
  } | {
    type: 'websocket';
    options: {
      hostname: string;
      port: number;
      secure: boolean;
      singleClient: boolean;
      staticAuthenticateClients: boolean;
      staticPort: boolean;
    };
  })[];
  identifier: HostIdentifier;
  version: number;
}
