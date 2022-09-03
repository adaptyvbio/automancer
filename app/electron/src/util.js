const childProcess = require('child_process');
const fs = require('fs/promises');
const { app } = require('electron');
const path = require('path');


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


async function findPythonInstallations() {
  let possiblePythonLocations = [
    'python3',
    'python',
    '/Applications/Xcode.app/Contents/Developer/usr/bin/python3',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3'
  ];

  let condaList = await runCommand('conda env list --json', { ignoreError: true });

  if (condaList) {
    possiblePythonLocations.push(...JSON.parse(condaList).envs.map((env) => path.join(env, 'bin/python')));
  }

  possiblePythonLocations = (await Promise.all(
    possiblePythonLocations.map(async (possibleLocation) => await which(possibleLocation))
  )).filter((possibleLocation, index, arr) => possibleLocation && (arr.indexOf(possibleLocation) === index));

  return (await Promise.all(possiblePythonLocations.map(async (possibleLocation) => {
    let version = await new Promise((resolve) => {
      childProcess.exec(`${possibleLocation} --version`, (err, stdout, stderr) => {
        if (err) {
          resolve(null);
        } else {
          let match = /^Python (\d+)\.(\d+)\.(\d+)\n$/.exec(stdout || stderr);

          if (match) {
            let major = parseInt(match[1]);
            let minor = parseInt(match[2]);
            let patch = parseInt(match[3]);

            resolve([major, minor, patch]);
          }
        }
      });
    });

    return version && {
      location: possibleLocation,
      version
    };
  }))).filter((installation) => installation);
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
        version: (await fs.readFile(path.join(betaPath, 'version.txt'))).toString().split('.').map((seg) => parseInt(seg))
      }
      : null
  };
}

function getResourcePath(relativePath) {
  return app.isPackaged
    ? path.join(process.resourcesPath, relativePath)
    : path.join(__dirname, '../tmp/resources', relativePath);
}

async function runCommand(command, options) {
  return await new Promise((resolve, reject) => {
    childProcess.exec(command, (err, stdout, stderr) => {
      if (err) {
        if (options.ignoreError) {
          resolve(null);
        } else {
          reject(err);
        }
      } else {
        resolve(stdout);
      }
    });
  });
}

async function which(command) {
  if (command.startsWith('/')) {
    return command;
  }

  return await new Promise((resolve, reject) => {
    childProcess.exec(`which ${command}`, (err, stdout, stderr) => {
      if (err) {
        // reject(err);
        resolve(null);
      } else {
        resolve(stdout.slice(0, -1));
      }
    });
  });
}


exports.Pool = Pool;
exports.findPythonInstallations = findPythonInstallations;
exports.fsExists = fsExists;
exports.getResourcePath = getResourcePath;
exports.getLocalHostModels = getLocalHostModels;
exports.fsMkdir = fsMkdir;
exports.which = which;
