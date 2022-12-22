import assert from 'assert';
import childProcess from 'child_process';
import { shell } from 'electron';
import fs from 'fs';
import { EOL } from 'os';
import path from 'path';
import readline from 'readline';

import type { HostWindow } from './host';
import type { HostSettings } from './interfaces';
import type { CoreApplication } from './main';
import * as util from './util';


export class LocalHost {
  closed!: Promise<{ code: number; } | null>;
  private process!: ReturnType<typeof childProcess.spawn>;
  private logger = this.app.logger.getChild(['localHost', this.hostSettings.id.slice(0, 8)]);
  private stateMessage: any | null;

  constructor(private app: CoreApplication, private hostWindow: HostWindow, private hostSettings: HostSettings) {
    this.hostSettings = hostSettings;
    this.hostWindow = hostWindow;

    this.stateMessage = null;
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

    let args = ['-m', 'pr1_server', '--data-dir', hostOptions.dirPath, '--local'];

    this.logger.debug(`Using command "${hostOptions.pythonPath}" ${args.join(' ')}`)
    this.logger.debug(`With environment variables: ${JSON.stringify(env)}`)

    // TODO: Add architecture
    this.process = childProcess.spawn(hostOptions.pythonPath, args, { env });

    // this.process.stderr!.pipe(process.stderr);


    let remainingData = '';

    this.process.stderr!.on('data', (chunk: Buffer) => {
      let events = (remainingData + chunk.toString()).split(EOL);

      remainingData = events.at(-1)!;

      for (let event of events.slice(0, 1)) {
        if (event.includes('::')) {
          let [rawLevelName, rawNamespace, ...rest] = event.split('::');

          let levelName = rawLevelName.trim().toLowerCase();
          let message = rest.join('::').trim();
          let namespace = rawNamespace.trim().split('.');

          this.logger.getChild(namespace).log(levelName as any, message);
        } else {
          console.error(event);
        }
      }
    });


    this.process.stderr!.pipe(fs.createWriteStream(logFilePath));


    // Listen to stdout

    let rl = readline.createInterface({
      input: this.process.stdout!,
      crlfDelay: Infinity
    });

    let iter = rl[Symbol.asyncIterator]();

    await iter.next();
    this.stateMessage = JSON.parse((await iter.next()).value);

    (async () => {
      for await (let msg of iter) {
        let message = JSON.parse(msg);

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

            this.hostWindow.window.webContents.send('localHost.message', message);
            break;
          }
        }
      }
    })();


    // Wait for the process to close

    this.closed = new Promise((resolve) => {
      this.process.on('close', (code, _signal) => {
        resolve((code !== null) && (code !== 0) ? { code } : null);
      });
    });
  }

  async ready() {
    this.hostWindow.window.webContents.send('localHost.message', this.stateMessage);
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
