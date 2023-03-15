import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { HostEnvironment } from './search';
import { SocketClientBackend } from './socket-client';
import { HostSettings } from './types/app-data';
import * as util from './util';


export async function createClient(hostEnvironmentOrSettings: HostEnvironment | HostSettings, logger: any, options: { logsDirPath: string; }) {
  let hostSettings = hostEnvironmentOrSettings as HostSettings;

  if (hostSettings.type === 'local') {
    // Start the executable

    logger.debug('Starting');

    let hostOptions = hostSettings.options;

    let logDirPath = path.join(options.logsDirPath, hostSettings.id);
    let logFilePath = path.join(logDirPath, Date.now().toString() + '.log');

    logger.debug(`Using log directory at '${logDirPath}'`);

    await util.fsMkdir(logDirPath);

    let env: Record<string, string> = {};

    if (!hostOptions.corePackagesInstalled) {
      // env['PYTHONPATH'] = this.app.localHostModels.beta.packagesPath;
      // logger.debug(...);
    }

    // @ts-expect-error
    let conf: ServerConfiguration = {
      ...hostOptions.conf,
      advertisement: {
        description: hostSettings.label
      },
      bridges: [
        ...hostOptions.conf.bridges,
        { type: 'socket',
          options: {
            type: 'unix',
            path: hostOptions.socketPath
          } }
      ]
    };

    let args = ['-m', 'pr1_server', '--conf', JSON.stringify(conf), '--data-dir', hostOptions.dirPath];
    let executable = hostOptions.pythonPath;

    if (hostOptions.architecture && (process.platform === 'darwin')) {
      args = ['-arch', hostOptions.architecture, executable, ...args];
      executable = 'arch';
    }

    logger.debug(`Using command "${executable.replaceAll(' ', '\\ ')} ${args.map((arg) => arg.replace(/[" {}]/g, '\\$&')).join(' ')}"`)
    logger.debug(`With environment variables: ${JSON.stringify(env)}`)

    let subprocess = childProcess.spawn(executable, args, {
      env,

      // stdin: ignore (not used)
      // stdout: inherit (inherit informal logs)
      // stderr: pipe (inherit but reformat informal logs)
      stdio: ['ignore', 'inherit', 'pipe']
    });


    // Wait for the process to close

    let closed = new Promise((resolve) => {
      subprocess.on('close', (code, _signal) => {
        let message = 'Process closed' + (code !== null ? ` with code ${code}` : '');

        if ((code ?? 0) > 0) {
          logger.error(message);
        } else {
          logger.info(message);
        }

        resolve((code !== null) && (code !== 0) ? { code } : null);
      });
    });


    // Listen for debug and log messages

    {
      let isDebugData = false;
      let remainingData = '';

      subprocess.stderr!.on('data', (chunk: Buffer) => {
        let events = (remainingData + chunk.toString()).split('\n');

        remainingData = events.at(-1)!;

        for (let event of events) {
          if (event.length > 0) {
            let isLog = event.includes('::');

            if (isLog) {
              let [rawLevelName, rawNamespace, ...rest] = event.split('::');

              let levelName = rawLevelName.trim().toLowerCase();
              let message = rest.join('::').substring(1);
              let namespace = rawNamespace.trim().split('.');

              logger.getChild(namespace).log(levelName as any, message);
            } else {
              if (isDebugData) {
                logger.debug(event);
              } else {
                logger.error(event);
              }
            }

            isDebugData = !isLog;
          }
        }
      });
    }

    subprocess.stderr!.pipe(fs.createWriteStream(logFilePath));


    // ...

    let backend = new SocketClientBackend({
      address: {
        path: hostOptions.socketPath
      },
      tls: null
    });

    let result = await backend.open();


    // Listen to stdout

/*       switch (message.type) {
      case 'owner.open': {
        await shell.openPath(message.path);
        break;
      }

      case 'owner.reveal': {
        shell.showItemInFolder(message.path);
        break;
      }

      case 'owner.trash': {
        await shell.trashItem(message.path);
        break;
      }

      default: {
        if (message.type === 'state') {
          this.stateMessage = message;
        }

        if (this.windowReady) {
          this.hostWindow.window!.webContents.send('localHost.message', message);
        }
      }
    } */

    return {
      ok: true,
      client: result.client
    };
  }

  if (hostSettings.type === 'tcp') {
    let backend = new SocketClientBackend({
      address: {
        host: hostSettings.options.hostname,
        port: hostSettings.options.port
      },
      tls: hostSettings.options.secure
        ? {
          serverCertificateCheck: false,
          serverCertificateFingerprint: hostSettings.options.fingerprint
        }
        : null
    });

    let result = await backend.open();

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      client: result.client
    };
  }

  throw new Error();
}
