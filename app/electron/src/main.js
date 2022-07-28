const crypto = require('crypto');
const { BrowserWindow, app, ipcMain } = require('electron');
const readline = require('readline');
const path = require('path');
const childProcess = require('child_process');
const fs = require('fs/promises');


class CoreApplication {
  static version = 1;

  constructor(app) {
    this.app = app;
    this.data = null;
    this.host = null;

    this.startupWindow = null;
    this.windows = [];
  }

  async createStartupWindow() {
    if (!this.startupWindow) {
      this.startupWindow = new StartupWindow(this);
    }
  }

  async createWindow() {
    let win = new HostWindow();
    this.windows.push(win);
  }

  async initialize() {
    await app.whenReady;
    await this.loadData();

    // ipcMain.on('ready', (event) => {
    //   let win = this.windows.find((win) => (win.window.webContents === event.sender));
    //   win.ready();
    // });

    ipcMain.handle('get-host-settings', async (_event) => {
      let id = crypto.randomUUID();

      return {
        [id]: {
          id: crypto.randomUUID(),
          builtin: true,
          hostId: null,
          label: 'Local host',
          locked: false,

          backendOptions: {
            type: 'internal'
          }
        }
      };
    });

    this.createStartupWindow();
  }

  async loadData() {
    let appDataPath = path.join(app.getPath('userData'), 'App Data');
    await fs.mkdir(appDataPath, { recursive: true });

    let appConfData;
    let appConfPath = path.join(appDataPath, 'app.json');

    if (await fsExists(appConfPath)) {
      let buffer = await fs.readFile(appConfPath);
      appConfData = JSON.parse(buffer.toString());

      if (appConfData.version !== CoreApplication.version) {
        throw new Error('App version mismatch');
      }
    } else {
      let appConfHandle = await fs.open(appConfPath, 'w');
      appConfData = {
        drafts: {},
        version: CoreApplication.version
      };

      appConfHandle.write(JSON.stringify(appConfData));

      await appConfHandle.close();
    }

    this.data = appConfData;
  }
}

async function main() {
  let core = new CoreApplication(app);

  await core.initialize();
}


main().catch((err) => {
  console.error(err);
});


class HostWindow {
  constructor() {
    this.spec = { type: 'local' };

    this.window = new BrowserWindow({
      webPreferences: {
        preload: path.join(__dirname, 'preload.js')
      }
    });
  }
}

class StartupWindow {
  constructor(app) {
    this.app = app;

    this.window = new BrowserWindow({
      width: 800,
      height: 450,
      backgroundColor: '#262528',
      fullscreenable: false,
      resizable: false,
      show: 1,//false,
      titleBarStyle: 'hiddenInset',
      webPreferences: {
        // contextIsolation: false,
        // nodeIntegration: true,
        preload: path.join(__dirname, 'startup/preload.js')
      }
    });

    this.window.loadFile(__dirname + '/startup/index.html');

    // this.window.webContents.once('ready', () => {
    //   this.window.show();
    // });

    ipcMain.on('ready', (event) => {
      if (event.sender === this.window.webContents) {
        this.window.show();
      }
    });
  }
}



class LocalHost {
  constructor() {
    this.process = childProcess.spawn(
      app.isPackaged
        ? path.join(process.resourcesPath, 'host/main')
        : path.join(__dirname, 'tmp/host/main'),
      ['--local']
    );

    this.process.stderr.pipe(process.stderr);

    let rl = readline.createInterface({
      input: proc.stdout,
      crlfDelay: Infinity
    });

    let stateMessage = null;

    (async () => {
      for await (const msg of rl) {
        let message = JSON.parse(msg);

        for (let client of clients) {
          if (client.ready) {
            client.window.webContents.send('host:message', message);
          }
        }

        if (message.type === 'state') {
          stateMessage = message;
        }
      }
    })();

    this.closed = new Promise((resolve) => {
      this.process.on('close', (code) => {
        resolve();
        // console.log(`child process exited with code ${code}`);
        app.exit(1);
      });
    });
  }
}



let clients = [];

const createWindow = () => {
  let win = new BrowserWindow({
    // width: 800,
    // height: 600,
    // titleBarStyle: 'hiddenInset'
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  clients.push({ ready: false, window: win });

  win.maximize();
  win.loadFile('index.html');
  win.webContents.openDevTools();
};

app.whenReady().then(() => {
  return;

  let proc = childProcess.spawn(
    app.isPackaged
      ? path.join(process.resourcesPath, 'host/main')
      : path.join(__dirname, 'tmp/host/main'),
    ['--local']
  );

  proc.stderr.pipe(process.stderr);

  let rl = readline.createInterface({
    input: proc.stdout,
    crlfDelay: Infinity
  });

  let stateMessage = null;

  (async () => {
    for await (const msg of rl) {
      let message = JSON.parse(msg);

      for (let client of clients) {
        if (client.ready) {
          client.window.webContents.send('host:message', message);
        }
      }

      if (message.type === 'state') {
        stateMessage = message;
      }
    }
  })();

  proc.on('close', (code) => {
    // console.log(`child process exited with code ${code}`);
    app.exit(1);
  });


  ipcMain.on('ready', (event) => {
    let client = clients.find((client) => client.window.webContents === event.sender);
    client.ready = true;

    if (stateMessage !== null) {
      event.sender.send('host:message', stateMessage);
    }
  });

  ipcMain.on('host:message', (event, message) => {
    proc.stdin.write(JSON.stringify(message) + '\n');
  });

  createWindow();
}, (err) => {
  console.error(err);
});


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
