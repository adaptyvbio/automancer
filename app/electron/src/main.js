const crypto = require('crypto');
const { BrowserWindow, app, dialog, ipcMain } = require('electron');
const readline = require('readline');
const path = require('path');
const childProcess = require('child_process');
const fs = require('fs/promises');


class CoreApplication {
  static version = 1;

  constructor(app) {
    this.app = app;

    this.data = null;
    this.dataDirPath = path.join(app.getPath('userData'), 'App Data');
    this.dataPath = path.join(this.dataDirPath, 'app.json');

    this.internalHost = null;
    this.startupWindow = null;
    this.hostWindows = {};

    this.app.on('will-quit', (event) => {
      if (this.internalHost) {
        event.preventDefault();
        this.internalHost.close();
      }
    });
  }

  async createStartupWindow() {
    if (!this.startupWindow) {
      this.startupWindow = new StartupWindow(this);
    }
  }

  async createHostWindow(hostSettings) {
    let win = new HostWindow(this, hostSettings);
    this.hostWindows[hostSettings.id] = win;
  }

  async initialize() {
    await app.whenReady();
    await this.loadData();

    let id = 'local';

    this.hostSettings = {
      [id]: {
        id,
        builtin: true,
        hostId: null,
        label: 'Local host',
        locked: false,

        backendOptions: {
          type: 'internal'
        }
      }
    };

    ipcMain.handle('get-host-settings', async (_event) => {
      return this.hostSettings;
    });

    ipcMain.on('launch-host', async (_event, settingsId) => {
      let hostSettings = this.hostSettings[settingsId];

      this.startupWindow?.window.close();

      let existingWindow = this.hostWindows[hostSettings.id];

      if (existingWindow) {
        existingWindow.window.focus();
      } else {
        this.createHostWindow(hostSettings);
      }
    });

    ipcMain.handle('drafts:create', async (_event, source) => {
      let result = await dialog.showSaveDialog();

      if (result.canceled) {
        return null;
      }

      let id = crypto.randomUUID();
      let draftEntry = {
        id,
        name: path.basename(result.filePath),
        path: result.filePath
      };

      await fs.writeFile(draftEntry.path, source);

      await this.setData({
        drafts: { ...this.data.drafts, [draftEntry.id]: draftEntry }
      });

      return draftEntry;
    });

    ipcMain.handle('drafts:delete', async (_event, draftId) => {
      let { [draftId]: _, ...drafts } = this.data.drafts;
      await this.setData({ drafts });
    });

    ipcMain.handle('drafts:get-source', async (_event, draftId) => {
      let draftEntry = this.data.drafts[draftId];

      return (await fs.readFile(draftEntry.path)).toString();
    });

    ipcMain.handle('drafts:list', async () => {
      return this.data.drafts;
    });

    ipcMain.handle('drafts:load', async (_event) => {
      let result = await dialog.showOpenDialog({
        filters: [
          { name: 'Protocols', extensions: ['.yml', '.yaml'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled) {
        return null;
      }

      let draftPath = result.filePaths[0];
      let id = crypto.randomUUID();

      let draftEntry = {
        id,
        name: path.basename(draftPath),
        path: draftPath
      };

      await this.setData({
        drafts: { ...this.data.drafts, [draftEntry.id]: draftEntry }
      });

      return draftEntry;
    });

    ipcMain.handle('drafts:update', async (_event, draftId, primitive) => {
      let draftEntry = this.data.drafts[draftId];
      let updatedDraftEntry = draftEntry;

      if (primitive.name !== void 0) {
        updatedDraftEntry = { ...draftEntry, name: primitive.name };

        await this.setData({
          drafts: { ...this.data.drafts, [draftId]: updatedDraftEntry }
        });
      }

      if (primitive.source !== void 0) {
        await fs.writeFile(draftEntry.path, primitive.source);
      }

      return updatedDraftEntry;
    });

    this.createStartupWindow();
  }

  async loadData() {
    await fs.mkdir(this.dataDirPath, { recursive: true });

    if (await fsExists(this.dataPath)) {
      let buffer = await fs.readFile(this.dataPath);
      this.data = JSON.parse(buffer.toString());

      // if (appConfData.version !== CoreApplication.version) {
      //   throw new Error('App version mismatch');
      // }
    } else {
      this.setData({
        drafts: {},
        version: CoreApplication.version
      });
    }
  }

  async setData(data) {
    this.data = { ...this.data, ...data };
    await fs.writeFile(this.dataPath, JSON.stringify(this.data));
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
  constructor(app, hostSettings) {
    this.app = app;
    this.spec = { type: 'local' };

    this.window = new BrowserWindow({
      webPreferences: {
        // additionalArguments: [hostSettings.id],
        preload: path.join(__dirname, 'host/preload.js')
      }
    });

    this.window.maximize();

    setTimeout(() => {
      this.window.loadFile(__dirname + '/host/index.html', { query: { hostSettingsId: hostSettings.id } });
    }, 500);

    if ((hostSettings.backendOptions.type === 'internal') && !this.app.internalHost) {
      this.app.internalHost = new InternalHost();
    }

    this.app.internalHost.addClient(this.window);
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

    this.window.once('close', () => {
      this.app.startupWindow = null;
    });

    this.window.loadFile(__dirname + '/startup/index.html');

    // this.window.webContents.once('ready', () => {
    //   this.window.show();
    // });

    ipcMain.on('ready', (event) => {
      if (!this.window.isDestroyed() && event.sender === this.window.webContents) {
        this.window.show();
      }
    });
  }
}



class InternalHost {
  constructor() {
    this.clients = [];

    this.process = childProcess.spawn(
      app.isPackaged
        ? path.join(process.resourcesPath, 'host/main')
        : path.join(__dirname, '../tmp/host/main'),
      ['--local']
    );

    this.process.stderr.pipe(process.stderr);

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
