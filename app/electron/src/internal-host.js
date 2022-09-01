const childProcess = require('child_process');
const crypto = require('crypto');
const { app, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const readline = require('readline');


exports.InternalHost = class InternalHost {
  constructor(coreApp, hostWindow) {
    this.app = coreApp;
    this.hostWindow = hostWindow;
    this.hostWindowReady = false;

    this.stateMessage = null;


    // Start the host

    let logFilePath = path.join(this.app.logsDirPath, Date.now().toString() + '.log');

    this.process = childProcess.spawn(
      app.isPackaged
        ? path.join(process.resourcesPath, 'host/main')
        : path.join(__dirname, '../tmp/host/main'),
      ['--data-dir', this.app.hostDirPath, '--local']
    );

    if (!app.isPackaged) {
      this.process.stderr.pipe(process.stderr);
    }

    this.process.stderr.pipe(fs.createWriteStream(logFilePath));


    // Listen to stdout

    let rl = readline.createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity
    });


    (async () => {
      for await (const msg of rl) {
        let message = JSON.parse(msg);

        if (this.hostWindowReady) {
          this.hostWindow.window.webContents.send('internalHost.message', message);
        }

        if (message.type === 'state') {
          this.stateMessage = message;
        }
      }
    })();


    // Wait for the process to close

    this.closed = new Promise((resolve) => {
      this.process.on('close', (code) => {
        resolve(code);
      });
    });
  }

  async ready() {
    this.hostWindowReady = true;
    this.hostWindow.window.webContents.send('internalHost.message', this.stateMessage);
  }

  sendMessage(message) {
    this.process.stdin.write(JSON.stringify(message) + '\n');
  }

  close() {
    this.process.kill(2);
  }
};
