const crypto = require('crypto');
const { BrowserWindow, Menu, app, dialog, ipcMain, shell } = require('electron');
const readline = require('readline');
const path = require('path');
const childProcess = require('child_process');
const fs = require('fs/promises');

const { HostWindow } = require('./host');
const { StartupWindow } = require('./startup');


class CoreApplication {
  static version = 1;

  constructor(app) {
    this.app = app;

    this.data = null;
    this.dataDirPath = path.join(this.app.getPath('userData'), 'App Data');
    this.dataPath = path.join(this.dataDirPath, 'app.json');

    this.logsDirPath = this.app.getPath('logs');

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
      await this.setData({
        drafts: {},
        version: CoreApplication.version
      });
    }

    console.log(this.data);
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
