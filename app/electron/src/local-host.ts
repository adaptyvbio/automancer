import assert from 'assert';
import childProcess from 'child_process';
import { shell } from 'electron';
import fs from 'fs';
import { EOL } from 'os';
import path from 'path';
import readline from 'readline';

import type { HostSettings } from 'pr1';

import type { HostWindow } from './host';
import type { CoreApplication } from './main';
import * as util from './util';


export class LocalHost {
  closed!: Promise<{ code: number; } | null>;
  private process!: ReturnType<typeof childProcess.spawn>;
  private logger = this.app.logger.getChild(['localHost', this.hostSettings.id.slice(0, 8)]);
  private stateMessage: any | null = null;
  private windowReady: boolean = false;

  constructor(private app: CoreApplication, private hostWindow: HostWindow, private hostSettings: HostSettings) {
    this.hostSettings = hostSettings;
    this.hostWindow = hostWindow;
  }

  async start() {
    // Start the executable

    this.logger.debug('Starting');


    let hostOptions = this.hostSettings.options;
    assert(hostOptions.type === 'local');

    let logDirPath = path.join(this.app.logsDirPath, this.hostSettings.id);
    let logFilePath = path.join(logDirPath, Date.now().toString() + '.log');

    this.logger.debug(`Using log directory at '${logDirPath}'`);

    await util.fsMkdir(logDirPath);

    let env = {};

    if (!hostOptions.corePackagesInstalled) {
      // env['PYTHONPATH'] = this.app.localHostModels.beta.packagesPath;
      // this.logger.debug(...);
    }

    let conf = {
      ...hostOptions.conf,
      bridges: [
        ...hostOptions.conf.bridges,
        { type: 'stdio',
          options: {} }
      ]
    };

    let args = ['-m', 'pr1_server', '--conf', JSON.stringify(conf), '--data-dir', hostOptions.dirPath];
    let executable = hostOptions.pythonPath;

    if (hostOptions.architecture && util.isDarwin) {
      args = ['-arch', hostOptions.architecture, executable, ...args];
      executable = 'arch';
    }

    this.logger.debug(`Using command "${hostOptions.pythonPath} ${args.map((arg) => arg.replaceAll(' ', '\\ ')).join(' ')}"`)
    this.logger.debug(`With environment variables: ${JSON.stringify(env)}`)

    // TODO: Add architecture
    this.process = childProcess.spawn(hostOptions.pythonPath, args, { env });


    // Wait for the process to close

    this.closed = new Promise((resolve) => {
      this.process.on('close', (code, _signal) => {
        let message = 'Process closed' + (code !== null ? ` with code ${code}` : '');

        if ((code ?? 0) > 0) {
          this.logger.error(message);
        } else {
          this.logger.info(message);
        }

        resolve((code !== null) && (code !== 0) ? { code } : null);
      });
    });


    // Listen for debug and log messages

    {
      let isDebugData = false;
      let remainingData = '';

      this.process.stderr!.on('data', (chunk: Buffer) => {
        let events = (remainingData + chunk.toString()).split(EOL);

        remainingData = events.at(-1)!;

        for (let event of events) {
          if (event.length > 0) {
            let isLog = event.includes('::');

            if (isLog) {
              let [rawLevelName, rawNamespace, ...rest] = event.split('::');

              let levelName = rawLevelName.trim().toLowerCase();
              let message = rest.join('::').trim();
              let namespace = rawNamespace.trim().split('.');

              this.logger.getChild(namespace).log(levelName as any, message);
            } else {
              if (isDebugData) {
                this.logger.debug(event);
              } else {
                this.logger.error(event);
              }
            }

            isDebugData = !isLog;
          }
        }
      });
    }


    // TODO: Remove ansi escape codes
    this.process.stderr!.pipe(fs.createWriteStream(logFilePath));


    // Listen to stdout

    let rl = readline.createInterface({
      input: this.process.stdout!,
      crlfDelay: Infinity
    });

    let iter = rl[Symbol.asyncIterator]();

    let isDebugData = false;

    let processMsg = async (msg: string) => {
      let message;

      try {
        message = JSON.parse(msg);
      } catch (err) {
        if (isDebugData) {
          this.logger.debug(msg);
        } else {
          this.logger.error(msg);
        }

        isDebugData = true;
        return;
      }

      isDebugData = false;

      switch (message.type) {
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
      }
    };

    let broken = false;

    for await (let msg of iter) {
      await processMsg(msg);

      if (this.stateMessage) {
        broken = true;
        break;
      }
    }

    if (!broken) {
      this.logger.error('Failed to obtain the initial state');
      return false;
    }

    (async () => {
      for await (let msg of iter) {
        processMsg(msg);
      }
    })().catch((err) => {
      this.logger.error('An error occured while processing messages (shown below).');
      this.logger.error(err.message);
    });

    this.logger.debug('Started');

    return true;
  }

  async ready() {
    this.windowReady = true;
    this.hostWindow.window!.webContents.send('localHost.message', this.stateMessage);
  }

  sendMessage(message: object) {
    this.process.stdin!.write(JSON.stringify(message) + '\n');
  }

  close() {
    this.sendMessage({ type: 'exit' });

    let timeout = setTimeout(() => {
      this.process.kill(2);
      this.process.off('close', listener);
    }, 1000);

    let listener = () => {
      clearTimeout(timeout);
    };

    this.process.on('close', listener);
  }
}
