import childProcess from 'child_process';
import electron from 'electron';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { PythonInstallation, PythonInstallationRecord, PythonVersion } from 'pr1-library';
import tls from 'tls';
import which from 'which';

import { Logger } from './logger';


export class Pool {
  #logger: Logger | null = null;
  #promises = new Set<Promise<unknown>>();

  constructor(logger?: Logger) {
    this.#logger = logger ?? null;
  }

  add(generator: (() => Promise<unknown>) | Promise<unknown>) {
    let promise = typeof generator === 'function'
      ? generator()
      : generator;

    promise
      .catch((err) => {
        if (this.#logger) {
          this.#logger.error(err.message);
        } else {
          console.error(err);
        }
      })
      .finally(() => {
        this.#promises.delete(promise);
      });

    this.#promises.add(promise);
  }

  get empty() {
    return this.size < 1;
  }

  get size() {
    return this.#promises.size;
  }

  async wait() {
    while (!this.empty) {
      await Promise.allSettled(this.#promises);
    }
  }
}


export async function findPythonInstallations() {
  let possiblePythonLocations = [
    'python3',
    'python',
    ...((process.platform === 'win32')
      ? ['py']
      : []),
    ...((process.platform === 'darwin')
      ? [
        '/Applications/Xcode.app/Contents/Developer/usr/bin/python3',
        '/opt/homebrew/bin/python3',
        '/usr/local/bin/python3'
      ]
      : [])
  ];

  let condaList = await runCommand('conda env list --json', { ignoreErrors: true });

  if (condaList) {
    possiblePythonLocations.push(...JSON.parse(condaList[0]).envs.map((env: string) => path.join(env, 'bin/python')));
  }

  possiblePythonLocations = (await Promise.all(
    possiblePythonLocations.map(async (possibleLocation) => await which(possibleLocation).catch(() => null))
  )).filter((possibleLocation): possibleLocation is string => possibleLocation !== null);

  let installations: PythonInstallationRecord = {};

  for (let possibleLocation of possiblePythonLocations) {
    if (possibleLocation in installations) {
      continue;
    }

    let info = await getPythonInstallationInfo(possibleLocation);

    if (!info) {
      continue;
    }

    let installation = {
      id: possibleLocation,
      info,
      leaf: true,
      path: possibleLocation,
      symlink: false
    };

    let lastInstallation = installation;
    installations[installation.id] = installation;

    if (process.platform !== 'win32') {
      while (true) {
        let linkPath: string;

        try {
          linkPath = await fs.readlink(lastInstallation.path);
        } catch (err) {
          if ((err as { code: string; }).code === 'EINVAL') {
            break;
          }

          throw err;
        }

        lastInstallation.symlink = true;

        let installationPath = path.resolve(path.dirname(lastInstallation.path), linkPath);

        if (installationPath in installations) {
          installations[installationPath].leaf = false;
          break;
        }

        let installation = {
          id: installationPath,
          info,
          leaf: false,
          path: installationPath,
          symlink: false
        } satisfies PythonInstallation;

        installations[installation.id] = installation;
        lastInstallation = installation;
      }
    }
  };

  return installations;
}

export async function getPythonInstallationInfo(location: string): Promise<PythonInstallation['info'] | null> {
  let architectures: string[] | null;
  let isVirtualEnv: boolean;
  let supportsVirtualEnv: boolean;
  let version: PythonVersion;

  {
    let result = await runCommand([location, '--version'], { ignoreErrors: true });

    if (!result) {
      return null;
    }

    let [stdout, stderr] = result;
    let possibleVersion = parsePythonVersion(stdout || stderr);

    if (!possibleVersion) {
      return null;
    }

    version = possibleVersion;
  }

  if (process.platform === 'darwin') {
    let [stdout, _stderr] = await runCommand(['file', location]);
    let matches = Array.from(stdout.matchAll(/executable ([a-z0-9_]+)$/gm));

    architectures = matches.map((match) => match[1]);
  } else {
    architectures = null;
  }

  {
    let [stdout, _stderr] = await runCommand([location, '-c', `import sys; print('Yes' if sys.base_prefix != sys.prefix else 'No')`]);
    isVirtualEnv = (stdout == "Yes\n");
  }

  supportsVirtualEnv = (await runCommand([location, '-m', 'venv', '-h'], { ignoreErrors: true })) !== null;

  return {
    architectures,
    isVirtualEnv,
    supportsVirtualEnv,
    version
  };
}

export function getComputerName() {
  let hostname = os.hostname();

  return hostname.endsWith('.local')
    ? hostname.slice(0, -'.local'.length)
    : hostname;
}

export function getResourcePath(relativePath: string) {
  return path.join(__dirname, '../..', relativePath);

  // return app.isPackaged
  //   ? path.join(process.resourcesPath, 'app', relativePath)
  //   : path.join(__dirname, '..', relativePath);
}

export function logError(err: any, logger: Logger) {
  logger.error(err.message);

  for (let line of err.stack.split('\n')) {
    logger.debug(line);
  }
}

export function parsePythonVersion(input: string): PythonVersion | null {
  let match = /^Python (\d+)\.(\d+)\.(\d+)\r?\n$/.exec(input);

  if (match) {
    let major = parseInt(match[1]);
    let minor = parseInt(match[2]);
    let patch = parseInt(match[3]);

    return [major, minor, patch];
  }

  return null;
}

export interface RunCommandOptions {
  architecture?: string | null;
  ignoreErrors?: unknown;
  timeout?: number;
}

export async function runCommand(args: string[] | string, options: RunCommandOptions & { ignoreErrors: true; }): Promise<[string, string] | null>;
export async function runCommand(args: string[] | string, options?: RunCommandOptions): Promise<[string, string]>;
export async function runCommand(args: string[] | string, options?: RunCommandOptions) {
  if (typeof args === 'string') {
    args = args.split(' ');
  }

  if (options?.architecture && (process.platform === 'darwin')) {
    args = ['arch', '-arch', options.architecture, ...args];
  }

  let [execPath, ...otherArgs] = args;

  return await new Promise<[string, string] | null>((resolve, reject) => {
    childProcess.execFile(execPath, otherArgs, { timeout: options?.timeout ?? 1000 }, (err, stdout, stderr) => {
      if (err) {
        if (options?.ignoreErrors) {
          resolve(null);
        } else {
          reject(err);
        }
      } else {
        resolve([stdout, stderr]);
      }
    });
  });
}


const transformCertificatePrincipal = (input: tls.Certificate): electron.CertificatePrincipal => ({
  commonName: input.CN,
  organizations: [input.O],
  organizationUnits: [input.OU],
  locality: input.L,
  state: input.ST,
  country: input.C,
});

const transformDate = (input: string) => Math.round(new Date(input).getTime() / 1000);

export function transformCertificate(cert: tls.PeerCertificate): electron.Certificate {
  return {
    data: `-----BEGIN CERTIFICATE-----\n${cert.raw.toString('base64')}\n-----END CERTIFICATE-----`,
    fingerprint: cert.fingerprint,
    issuer: transformCertificatePrincipal(cert.issuer),
    issuerName: cert.issuer.CN,
    subject: transformCertificatePrincipal(cert.subject),
    subjectName: cert.issuer.CN,
    serialNumber: cert.serialNumber,
    validStart: transformDate(cert.valid_from),
    validExpiry: transformDate(cert.valid_to),

    // @ts-expect-error
    issuerCert: null
  };
}
