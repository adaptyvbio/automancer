import { Brand } from './util';


export type HostIdentifier = string;

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
