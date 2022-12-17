const childProcess = require('child_process');
const fs = require('fs/promises');
const { app } = require('electron');
const path = require('path');
const which = require('which');


const isDarwin = (process.platform === 'darwin');


class Pool {
  constructor() {
    this._promises = new Set();
  }

  add(generator) {
    let promise = generator();

    promise.finally(() => {
      this._promises.delete(promise);
    });

    this._promises.add(promise);
  }

  get empty() {
    return (this._promises.size < 1);
  }

  async wait() {
    while (!this.empty) {
      await Promise.allSettled(this._promises);
    }
  }
}


function defer() {
  let resolve, reject;
  let promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

async function findPythonInstallations() {
  let possiblePythonLocations = [
    'python3',
    'python',
    '/Applications/Xcode.app/Contents/Developer/usr/bin/python3',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3'
  ];

  let condaList = await runCommand('conda env list --json', { ignoreErrors: true });

  if (condaList) {
    possiblePythonLocations.push(...JSON.parse(condaList[0]).envs.map((env) => path.join(env, 'bin/python')));
  }

  possiblePythonLocations = (await Promise.all(
    possiblePythonLocations.map(async (possibleLocation) => await which(possibleLocation).catch(() => null))
  )).filter((possibleLocation) => possibleLocation);

  let installations = {};

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
        if (err.code === 'EINVAL') {
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
      };

      installations[installation.id] = installation;
      lastInstallation = installation;
    }
  };

  // TODO: Add support for virtual environments
  // TODO: Add support for system installations
  // Use arch -x84_64 <command>

  return installations;
}

async function fsExists(path) {
  try {
    await fs.stat(path)
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false;
    }

    throw err;
  }

  return true;
}

async function fsMkdir(dirPath) {
  if (!(await fsExists(dirPath))) {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

async function getLocalHostModels() {
  let alphaPath = this.getResourcePath('alpha');
  let betaPath = this.getResourcePath('beta');

  return {
    alpha: await fsExists(alphaPath)
      ? { executablePath: path.join(alphaPath, 'contents/contents') }
      : null,
    beta: await fsExists(betaPath)
      ? {
        packagesPath: path.join(betaPath, 'packages'),
        version: parsePythonVersion((await fs.readFile(path.join(betaPath, 'version.txt'))).toString())
      }
      : null
  };
}

async function getPythonInstallationInfo(location) {
  let result = await runCommand(`"${location}" --version`, { ignoreErrors: true });

  if (!result) {
    return null;
  }

  let [stdout, stderr] = result;
  let version = parsePythonVersion(stdout || stderr);

  if (!version) {
    return null;
  }

  let architectures;

  if (process.platform === 'darwin') {
    let [stdout, _stderr] = await runCommand(`file "${location}"`);
    let matches = Array.from(stdout.matchAll(/executable ([a-z0-9_]+)$/gm));

    architectures = matches.map((match) => match[1]);
  } else {
    architectures = null;
  }

  return {
    architectures,
    version
  };
}

function getResourcePath(relativePath) {
  return app.isPackaged
    ? path.join(process.resourcesPath, relativePath)
    : path.join(__dirname, '../../tmp/resources', relativePath);
}

function parsePythonVersion(input) {
  let match = /^Python (\d+)\.(\d+)\.(\d+)\r?\n$/.exec(input);

  if (match) {
    let major = parseInt(match[1]);
    let minor = parseInt(match[2]);
    let patch = parseInt(match[3]);

    return [major, minor, patch];
  }

  return null;
}

async function runCommand(command, options) {
  return await new Promise((resolve, reject) => {
    childProcess.exec(command, (err, stdout, stderr) => {
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


exports.Pool = Pool;
exports.defer = defer;
exports.findPythonInstallations = findPythonInstallations;
exports.fsExists = fsExists;
exports.fsMkdir = fsMkdir;
exports.getResourcePath = getResourcePath;
exports.getLocalHostModels = getLocalHostModels;
exports.getPythonInstallationInfo = getPythonInstallationInfo;
exports.parsePythonVersion = parsePythonVersion;
exports.runCommand = runCommand;
exports.isDarwin = isDarwin;
