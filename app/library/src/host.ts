import assert from 'node:assert';
import childProcess, { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Client, createErrorWithCode, defer, Deferred } from 'pr1-shared';

import { HostEnvironment } from './search';
import { SocketClientBackend } from './socket-client';
import { HostSettings, HostSettingsOptionsTcp, HostSettingsOptionsUnix, ServerConfiguration } from './types/app-data';
import * as util from './util';


export type BridgeOptions = HostSettingsOptionsTcp | HostSettingsOptionsUnix;


export async function createClient(hostEnvironmentOrSettings: HostEnvironment | HostSettings, logger: any, options: { logsDirPath: string; }) {
  let hostSettings = hostEnvironmentOrSettings as HostSettings;

  let bridgeOptions: BridgeOptions;
  let subprocess: ChildProcess | null = null;
  let subprocessClosed: Promise<boolean> | null = null;

  let waitForSubprocessExit = async () => {
    let timeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      timeout = null;
      subprocess!.kill(2);
    }, 1000);

    try {
      return await subprocessClosed!;
    } finally {
      if (timeout !== null) {
        clearTimeout(timeout);
        timeout = null;
      }
    }
  };

  if (hostSettings.options.type === 'local') {
    // Start the executable

    logger.debug('Starting');

    let hostOptions = hostSettings.options;

    let logDirPath = path.join(options.logsDirPath, hostSettings.id);
    let logFilePath = path.join(logDirPath, Date.now().toString() + '.log');

    logger.debug(`Using log directory at '${logDirPath}'`);

    await util.fsMkdir(logDirPath);

    let env: Record<string, string> = {
      'PYTHONIOENCODING': 'utf-8'
    };

    if (!hostOptions.corePackagesInstalled) {
      // env['PYTHONPATH'] = this.app.localHostModels.beta.packagesPath;
      // logger.debug(...);
    }

    let conf: ServerConfiguration = {
      ...hostOptions.conf,
      advertisement: {
        description: hostSettings.label
      },
      bridges: [
        ...hostOptions.conf.bridges,
        { type: 'socket',
          options: {
            type: 'tcp',
            addresses: ['127.0.0.1'],
            port: 0,
            secure: false
          } }
      ],
      static: {
        hostname: '127.0.0.1',
        port: 0,
        secure: false
      }
    };

    let args = ['-m', 'pr1_server', '--conf', JSON.stringify(conf), '--data-dir', hostOptions.dirPath, '--local'];
    let executable = hostOptions.pythonPath;

    if (hostOptions.architecture && (process.platform === 'darwin')) {
      args = ['-arch', hostOptions.architecture, executable, ...args];
      executable = 'arch';
    }

    logger.debug(`Using command "${executable.replaceAll(' ', '\\ ')} ${args.map((arg) => arg.replace(/[" {}]/g, '\\$&')).join(' ')}"`)
    logger.debug(`With environment variables: ${JSON.stringify(env)}`)

    subprocess = childProcess.spawn(executable, args, {
      env,

      // stdin: ignore (not used)
      // stdout: inherit (inherit informal logs)
      // stderr: pipe (inherit but reformat informal logs)
      stdio: ['ignore', 'pipe', 'pipe']
    });


    // Wait for the process to close

    subprocessClosed = new Promise((resolve) => {
      subprocess!.on('close', (code, _signal) => {
        let message = 'Process closed' + (code !== null ? ` with code ${code}` : '');

        if ((code ?? 0) > 0) {
          logger.error(message);
        } else {
          logger.info(message);
        }

        resolve((code !== null) && (code !== 0));
      });
    });


    // Listen for debug and log messages

    {
      let isDebugData = false;
      let remainingData = '';

      subprocess.stderr!.on('data', (chunk: Buffer) => {
        let lines = (remainingData + chunk.toString()).split('\n');

        remainingData = lines.at(-1)!;

        for (let line of lines.slice(0, -1)) {
          if (line.length > 0) {
            let isLog = line.includes('::');

            if (isLog) {
              let [rawLevelName, rawNamespace, ...rest] = line.split('::');

              let levelName = rawLevelName.trim().toLowerCase();
              let message = rest.join('::').substring(1);
              let namespace = rawNamespace.trim().split('.');

              logger.getChild(namespace).log(levelName as any, message);
            } else {
              if (isDebugData) {
                logger.debug(line);
              } else {
                logger.error(line);
              }
            }

            isDebugData = !isLog;
          }
        }
      });
    }

    subprocess.stderr!.pipe(fs.createWriteStream(logFilePath));


    // Listen for bridge list

    let bridgeDatasDeferred: Deferred<BridgeOptions[]> | null = defer();

    {
      let remainingData = '';

      subprocess.stdout!.on('data', (chunk) => {
        let lines = (remainingData + chunk.toString()).split('\n');
        remainingData = lines.at(-1)!;

        for (let line of lines.slice(0, 1)) {
          if (bridgeDatasDeferred) {
            let bridgeDatas: BridgeOptions[] | null = null;

            try {
              bridgeDatas = JSON.parse(line);
            } catch (err) { }

            if (bridgeDatas) {
              bridgeDatasDeferred.resolve(bridgeDatas);
              bridgeDatasDeferred = null;
              return;
            }
          }

          process.stdout.write(line + '\n');
        }
      });
    }

    let bridgeOptionsList;

    try {
      bridgeOptionsList = await Promise.race([
        bridgeDatasDeferred.promise,
        subprocessClosed.then(() => Promise.reject(createErrorWithCode('Subprocess closed', 'APP_SUBPROCESS_CLOSED')))
      ]);
    } catch (err: any) {
      if (err.code === 'APP_SUBPROCESS_CLOSED') {
        return {
          ok: false,
          reason: 'subprocess_closed'
        };
      }

      throw err;
    }

    bridgeOptions = bridgeOptionsList.find((bridgeOptions) =>
      (bridgeOptions.type === 'unix') || ['127.0.0.1', '::1'].includes(bridgeOptions.hostname)
    )!;
  } else {
    bridgeOptions = hostSettings.options;
  }

  if (bridgeOptions.type === 'tcp') {
    let backend = new SocketClientBackend({
      address: {
        host: bridgeOptions.hostname,
        port: bridgeOptions.port
      },
      tls: bridgeOptions.secure
        ? {
          serverCertificateCheck: false,
          serverCertificateFingerprint: bridgeOptions.fingerprint
        }
        : null
    });

    let openResult = await backend.open();

    if (!openResult.ok) {
      return openResult;
    }

    let client = new Client(backend, {
      async close() {
        // let exitSubprocess = subprocess && !(await client.request({ type: 'isBusy' }));
        let exitSubprocess = !!subprocess;

        if (exitSubprocess) {
          backend.send({ type: 'exit' });
        }

        backend.close();
        await backend.closed;

        if (exitSubprocess) {
          await waitForSubprocessExit();
        }
      }
    });

    let initResult = await client.initialize();

    if (!initResult.ok) {
      return initResult;
    }

    // TODO: Move to Client
    // if (result.identifier !== bridgeOptions.identifier) {
    //   return {
    //     ok: false,
    //     reason: 'identifier_mismatch'
    //   };
    // }

    return {
      ok: true,
      client
    };
  }

  throw new Error('Not implemented');
}
