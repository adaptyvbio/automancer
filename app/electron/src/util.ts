import childProcess from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import which from 'which';

import { PythonInstallation, PythonInstallationRecord } from './interfaces';


export const isDarwin = (process.platform === 'darwin');


export class Pool {
  #promises = new Set<Promise<unknown>>();

  add(generator: (() => Promise<unknown>) | Promise<unknown>) {
    let promise = typeof generator === 'function'
      ? generator()
      : generator;

    promise.finally(() => {
      this.#promises.delete(promise);
    });

    this.#promises.add(promise);
  }

  get empty() {
    return (this.#promises.size < 1);
  }

  async wait() {
    while (!this.empty) {
      await Promise.allSettled(this.#promises);
    }
  }
}


export function defer<T>() {
  let resolve!: (value: PromiseLike<T> | T) => void;
  let reject!: (err?: any) => void;

  let promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

export async function findPythonInstallations() {
  let possiblePythonLocations = [
    'python3',
    'python',
    '/Applications/Xcode.app/Contents/Developer/usr/bin/python3',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3'
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

    while (true) {
      let linkPath = null;

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
  };

  return installations;
}

export async function fsExists(path: string) {
  try {
    await fs.stat(path)
  } catch (err) {
    if ((err as { code: string; }).code === 'ENOENT') {
      return false;
    }

    throw err;
  }

  return true;
}

export async function fsMkdir(dirPath: string) {
  if (!(await fsExists(dirPath))) {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

export async function getPythonInstallationInfo(location: string): Promise<PythonInstallation['info'] | null> {
  let architectures, isVirtualEnv, supportsVirtualEnv, version;

  {
    let result = await runCommand(`"${location}" --version`, { ignoreErrors: true });

    if (!result) {
      return null;
    }

    let [stdout, stderr] = result;
    version = parsePythonVersion(stdout || stderr);

    if (!version) {
      return null;
    }
  }

  if (process.platform === 'darwin') {
    let [stdout, _stderr] = await runCommand(`file "${location}"`);
    let matches = Array.from(stdout.matchAll(/executable ([a-z0-9_]+)$/gm));

    architectures = matches.map((match) => match[1]);
  } else {
    architectures = null;
  }

  {
    let [stdout, _stderr] = await runCommand(`"${location}" -c "import sys; print('Yes' if sys.base_prefix != sys.prefix else 'No')"`)
    isVirtualEnv = (stdout == "Yes\n")
  }

  supportsVirtualEnv = (await runCommand(`"${location}" -m venv -h`, { ignoreErrors: true })) !== null;

  return {
    architectures,
    isVirtualEnv,
    supportsVirtualEnv,
    version
  };
}

export function getResourcePath(relativePath: string) {
  return path.join(__dirname, '../..', relativePath);

  // return app.isPackaged
  //   ? path.join(process.resourcesPath, 'app', relativePath)
  //   : path.join(__dirname, '..', relativePath);
}

export function parsePythonVersion(input: string): [number, number, number] | null {
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

export async function runCommand(rawCommand: string, options: RunCommandOptions & { ignoreErrors: true; }): Promise<[string, string] | null>;
export async function runCommand(rawCommand: string, options?: RunCommandOptions): Promise<[string, string]>;
export async function runCommand(rawCommand: string, options?: RunCommandOptions) {
  let command = (options?.architecture && isDarwin)
    ? `arch -arch "${options.architecture}" ${rawCommand}`
    : rawCommand;

  return await new Promise<[string, string] | null>((resolve, reject) => {
    childProcess.exec(command, { timeout: options?.timeout ?? 1000 }, (err, stdout, stderr) => {
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
