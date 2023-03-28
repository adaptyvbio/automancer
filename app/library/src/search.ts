import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { HostIdentifier } from 'pr1-shared';

import { Scanner, type Service } from './scan';
import { SocketClientBackend } from './socket-client';
import { AppData, HostSettings, TcpHostOptionsCandidate } from './types/app-data';


export function getDesktopAppDataLocation(): string | null {
  switch (process.platform) {
    case 'darwin': return path.resolve(os.homedir(), 'Application Support/PR–1/App Data');
    case 'win32': return null; // TODO: Update
    default: return null;
  }
}


export const AppDataVersion = 1;

export async function getDesktopAppData() {
  let location = getDesktopAppDataLocation();

  if (!location) {
    return null;
  }

  let rawData;

  try {
    rawData = await fs.readFile(path.join(location, 'app.json'));
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return null;
    }

    throw err;
  }

  let data = JSON.parse(rawData.toString()) as AppData;

  if (data.version !== AppDataVersion) {
    return null;
  }

  return data;
}


export interface BridgeTcp {
  type: 'tcp';
  options: TcpHostOptionsCandidate;
}

export interface BridgeUnixSocket {
  type: 'unix';
  options: {
    path: string;
  };
}

export interface BridgeWebsocket {
  type: 'websocket';
  options: {
    hostname: string;
    port: number;
  };
}

export interface BridgeStdio {
  type: 'stdio';
  options: {};
}

export type Bridge = BridgeTcp | BridgeUnixSocket | BridgeStdio | BridgeWebsocket;
export type BridgeRemote = BridgeTcp | BridgeWebsocket;


export interface HostEnvironment {
  bridges: Bridge[];
  identifier: HostIdentifier;
  hostSettings: HostSettings | null;
  label: string | null;
}

export type HostEnvironments = Record<HostIdentifier, HostEnvironment>;

export interface AdvertisedHostInfo {
  bridges: BridgeRemote[];
  identifier: HostIdentifier;
  ipAddress: string;
  description: string;
}


export const UnixSocketDirPath = '/tmp/pr1';

export const TcpServiceType = '_prone._tcp.local';
export const WebsocketServiceType = '_prone._http._tcp.local';


export function getAdvertisedHostInfoFromService(service: Service): AdvertisedHostInfo | null {
  let bridges: BridgeRemote[] = [];
  let ipAddress = (service.address?.ipv4 || service.address?.ipv6);

  if (service.address && service.properties && ipAddress) {
    if (service.types.includes(TcpServiceType)) {
      bridges.push({
        type: 'tcp',
        options: {
          hostname: ipAddress,
          fingerprint: null,
          identifier: (service.properties['identifier'] as HostIdentifier),
          password: null,
          port: service.address.port,
          secure: true,
          trusted: false
        }
      });
    }

    if (service.types.includes(WebsocketServiceType)) {
      bridges.push({
        type: 'websocket',
        options: {
          hostname: ipAddress,
          port: service.address.port
        }
      });
    }

    return {
      bridges,
      identifier: (service.properties['identifier'] as HostIdentifier),
      ipAddress,
      description: service.properties['description']
    };
  }

  return null;
}


export async function searchForHostEnvironments() {
  let environments: HostEnvironments = {};


  // Load known host settings

  let appData = await getDesktopAppData();

  for (let hostSettings of Object.values(appData?.hostSettingsRecord ?? {})) {
    if (hostSettings.options.type === 'local') {
      let identifier = hostSettings.options.identifier;

      environments[identifier] = {
        bridges: [],
        identifier,
        hostSettings,
        label: hostSettings.label
      };
    }
  }


  // Search for hosts advertisted over mDNS

  let services = await Scanner.getServices([
    TcpServiceType,
    WebsocketServiceType
  ]);

  for (let service of Object.values(services)) {
    let info = getAdvertisedHostInfoFromService(service);

    if (info) {
      if (!(info.identifier in environments)) {
        environments[info.identifier] = {
          bridges: [],
          identifier: info.identifier,
          hostSettings: null,
          label: info.description
        };
      }

      let environment = environments[info.identifier];
      environment.bridges.push(...info.bridges);
    }
  }


  // Search for UNIX sockets

  let socketFileNames;

  try {
    socketFileNames = await fs.readdir(UnixSocketDirPath);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      socketFileNames = [];
    }

    throw err;
  }

  for (let socketFileName of socketFileNames) {
    let match = /^(.*)\.sock$/g.exec(socketFileName);

    if (!match) {
      continue;
    }

    let identifier = match[1] as HostIdentifier;

    let socketFilePath = path.join(UnixSocketDirPath, socketFileName);
    let result = await SocketClientBackend.test({
      address: { path: socketFilePath },
      tls: null
    });

    if (!result.ok) {
      continue;
    }

    if (!(identifier in environments)) {
      environments[identifier] = {
        bridges: [],
        hostSettings: null,
        identifier,
        label: null
      };
    }

    environments[identifier].bridges.push({
      type: 'unix',
      options: {
        path: socketFilePath
      }
    });
  }

  return environments;
}


export async function searchForAdvertistedHosts() {
  let services = await Scanner.getServices([
    TcpServiceType,
    WebsocketServiceType
  ]);

  return Object.values(services)
    .map((service) => getAdvertisedHostInfoFromService(service))
    .filter((info) : info is AdvertisedHostInfo => info !== null);
}
