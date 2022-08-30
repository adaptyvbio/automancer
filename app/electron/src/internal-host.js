const childProcess = require('child_process');
const crypto = require('crypto');
const { app, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const readline = require('readline');


exports.InternalHost = class InternalHost {
  constructor(coreApp) {
    this.app = coreApp;
    this.clients = [];

    let logFilePath = path.join(this.app.logsDirPath, Date.now().toString() + '.log');

    this.process = childProcess.spawn(
      app.isPackaged
        ? path.join(process.resourcesPath, 'host/main')
        : path.join(__dirname, '../tmp/host/main'),
      ['--local']
    );

    if (!app.isPackaged) {
      this.process.stderr.pipe(process.stderr);
    }

    this.process.stderr.pipe(fs.createWriteStream(logFilePath));

    let rl = readline.createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity
    });

    let stateMessage = null;

    (async () => {
      for await (const msg of rl) {
        let message = JSON.parse(msg);

        for (let client of this.clients) {
          if (client.ready) {
            client.window.webContents.send('host:message', message);
          }
        }

        if (message.type === 'state') {
          stateMessage = message;
        }
      }
    })();

    ipcMain.handle('host:ready', async (event) => {
      let client = this.clients.find((client) => client.window.webContents === event.sender);
      client.ready = true;

      if (stateMessage !== null) {
        event.sender.send('host:message', stateMessage);
      }
    });

    ipcMain.on('host:message', (event, message) => {
      this.process.stdin.write(JSON.stringify(message) + '\n');
    });

    this.closed = new Promise((resolve) => {
      this.process.on('close', (code) => {
        resolve();
        // console.log(`child process exited with code ${code}`);
        app.exit(0);
      });
    });
  }

  addClient(win) {
    this.clients.push({ ready: false, window: win });
  }

  close() {
    this.process.kill(2);
  }
};
