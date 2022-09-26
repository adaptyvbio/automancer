const childProcess = require('child_process');
const { shell } = require('electron');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const util = require('./util');


class InternalHost {
  constructor(coreApp, hostWindow, hostSettings) {
    this.app = coreApp;
    this.hostSettings = hostSettings;
    this.hostWindow = hostWindow;

    this.stateMessage = null;
  }

  async start() {
    // Start the host

    let backendOptions = this.hostSettings.backendOptions;

    let logDirPath = path.join(this.app.logsDirPath, this.hostSettings.id);
    let logFilePath = path.join(logDirPath, Date.now().toString() + '.log');

    await util.fsMkdir(logDirPath);

    let args = [];
    let env = {};
    let command;

    switch (this.hostSettings.backendOptions.type) {
      case 'alpha': {
        command = this.app.localHostModels.alpha.executablePath;
        break;
      }

      case 'beta': {
        command = backendOptions.pythonLocation;
        args.push('-m', 'pr1_server');
        env['PYTHONPATH'] = this.app.localHostModels.beta.packagesPath;

        break;
      }
    }

    args.push('--data-dir', backendOptions.dataDirPath, '--local');

    this.process = childProcess.spawn(command, args, { env });

    this.process.stderr.pipe(process.stderr);
    this.process.stderr.pipe(fs.createWriteStream(logFilePath));


    // Listen to stdout

    let rl = readline.createInterface({
      input: this.process.stdout,
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

          case 'reveal': {
            shell.showItemInFolder(message.path);
            break;
          }

          case 'trash': {
            await shell.trashItem(message.path);
            break;
          }

          default: {
            if (message.type === 'state') {
              this.stateMessage = message;
            }

            this.hostWindow.window.webContents.send('internalHost.message', message);
            break;
          }
        }
      }
    })();


    // Wait for the process to close

    this.closed = new Promise((resolve) => {
      this.process.on('close', (code, _signal) => {
        resolve((code !== 0) ? { code } : null);
      });
    });
  }

  async ready() {
    this.hostWindow.window.webContents.send('internalHost.message', this.stateMessage);
  }

  sendMessage(message) {
    this.process.stdin.write(JSON.stringify(message) + '\n');
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

exports.InternalHost = InternalHost;
