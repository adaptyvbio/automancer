const chokidar = require('chokidar');
const crypto = require('crypto');
const { BrowserWindow, Menu, app, dialog, ipcMain, shell, ipcRenderer } = require('electron');
const readline = require('readline');
const path = require('path');
const childProcess = require('child_process');
const fs = require('fs/promises');

const { HostWindow } = require('./host');
const { StartupWindow } = require('./startup');
const util = require('./util');


class CoreApplication {
  static version = 1;

  pool = new util.Pool();

  constructor(app) {
    this.app = app;
    this.quitting = false;

    this.data = null;
    this.dataDirPath = path.join(this.app.getPath('userData'), 'App Data');
    this.dataPath = path.join(this.dataDirPath, 'app.json');

    this.logsDirPath = this.app.getPath('logs');

    this.startupWindow = null;
    this.hostWindows = {};

    this.internalHostSettings = {
      id: 'local',
      builtin: true,
      hostId: null,
      label: 'Local host',
      locked: false,

      backendOptions: {
        type: 'internal',
        id: 'local'
      }
    };

    this.app.on('before-quit', () => {
      this.quitting = true;
    });

    this.app.on('will-quit', (event) => {
      if (!this.pool.empty) {
        event.preventDefault();

        this.pool.wait().then(() => {
          this.app.quit();
        });
      }
    });
  }

  get hostSettings() {
    return {
      ...this.data.hostSettings,
      [this.internalHostSettings.id]: this.internalHostSettings
    };
  }

  async createStartupWindow() {
    if (this.startupWindow) {
      this.startupWindow.focus();
    } else {
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


    // Window management

    ipcMain.on('ready', (event) => {
      BrowserWindow.fromWebContents(event.sender).show();
    });


    // Host settings management

    ipcMain.handle('hostSettings.create', async (_event, { hostSettings }) => {
      await this.setData({
        hostSettings: {
          ...this.data.hostSettings,
          [hostSettings.id]: hostSettings
        }
      });
    });

    ipcMain.handle('hostSettings.delete', async (_event, { hostSettingsId }) => {
      let { [hostSettingsId]: _, ...hostSettings } = this.data.hostSettings;
      await this.setData({ hostSettings });
    });

    ipcMain.handle('hostSettings.query', async (_event) => {
      return {
        defaultHostSettingsId: this.data.defaultHostSettingsId,
        hostSettings: this.hostSettings
      };
    });

    ipcMain.handle('hostSettings.setDefault', async (_event, { hostSettingsId }) => {
      await this.setData({ defaultHostSettingsId: hostSettingsId });
    });


    // Other

    ipcMain.on('launch-host', async (_event, hostSettingsId) => {
      this.launchHost(hostSettingsId);
    });


    // Draft management

    let createClientDraftEntry = async (draftEntry) => {
      let stats = await fs.stat(draftEntry.path);

      return {
        id: draftEntry.id,
        lastOpened: draftEntry.lastOpened,
        lastModified: stats.mtimeMs,
        name: draftEntry.name,
        path: path.basename(draftEntry.path)
      };
    };

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

    ipcMain.handle('drafts.delete', async (_event, draftId) => {
      let { [draftId]: _, ...drafts } = this.data.drafts;
      await this.setData({ drafts });
    });

    ipcMain.handle('drafts:get-source', async (_event, draftId) => {
      let draftEntry = this.data.drafts[draftId];

      return (await fs.readFile(draftEntry.path)).toString();
    });

    ipcMain.handle('drafts.list', async () => {
      return await Promise.all(
        Object.values(this.data.drafts).map(createClientDraftEntry)
      );
    });

    ipcMain.handle('drafts.load', async (_event) => {
      let result = await dialog.showOpenDialog({
        filters: [
          { name: 'Protocols', extensions: ['yml', 'yaml'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled) {
        return null;
      }

      let id = crypto.randomUUID();

      let draftEntry = {
        id,
        lastOpened: Date.now(),
        name: null,
        path: result.filePaths[0]
      };

      await this.setData({
        drafts: { ...this.data.drafts, [draftEntry.id]: draftEntry }
      });

      return createClientDraftEntry(draftEntry);
    });

    ipcMain.handle('drafts.openFile', async (_event, draftId, filePath) => {
      let draftEntry = this.data.drafts[draftId];
      shell.openPath(draftEntry.path);
    });

    ipcMain.handle('drafts.revealFile', async (_event, draftId, filePath) => {
      let draftEntry = this.data.drafts[draftId];
      shell.showItemInFolder(draftEntry.path);
    });

    let nextWatcherIndex = 0;
    let watchers = {};

    ipcMain.handle('drafts.watch', async (event, draftId) => {
      let draftEntry = this.data.drafts[draftId];

      let getChange = async () => {
        let stats = await fs.stat(draftEntry.path);
        let source = (await fs.readFile(draftEntry.path)).toString();

        return {
          lastModified: stats.mtimeMs,
          source
        };
      };

      let change = await getChange();

      let watcherIndex = nextWatcherIndex++;
      let watcher = chokidar.watch(draftEntry.path);

      watcher.on('change', () => {
        this.pool.add(async () => {
          let change = await getChange();
          event.sender.send('drafts.change', change);
        });
      });


      watchers[watcherIndex] = watcher;

      return {
        ...change,
        watcherIndex
      };
    });

    ipcMain.handle('drafts.watchStop', async (_event, watcherIndex) => {
      await watchers[watcherIndex].close();
      delete watchers[watcherIndex];
    });

    ipcMain.handle('drafts.write', async (_event, draftId, primitive) => {
      let draftEntry = this.data.drafts[draftId];

      if (primitive.name) {
        await this.setData({
          drafts: { ...this.data.drafts, [draftEntry.id]: { ...draftEntry, name: primitive.name } }
        });
      }

      if (primitive.source) {
        await fs.writeFile(draftEntry.path, primitive.source);

        let stats = await fs.stat(draftEntry.path);
        return stats.mtimeMs;
      }

      return null;
    });


    // Internal host

    ipcMain.handle('internalHost.ready', async (_event, hostSettingsId) => {
      await this.hostWindows[hostSettingsId].internalHost.ready();
    });

    ipcMain.on('internalHost.message', async (_event, hostSettingsId, message) => {
      this.hostWindows[hostSettingsId].internalHost.sendMessage(message);
    });


    if (this.data.defaultHostSettingsId) {
      this.launchHost(this.data.defaultHostSettingsId);
    } else {
      this.createStartupWindow();
    }
  }


  launchHost(hostSettingsId) {
    let existingWindow = this.hostWindows[hostSettingsId];

    if (existingWindow) {
      if (!existingWindow.window.isDestroyed()) {
        this.startupWindow?.window.close();
        existingWindow.window.focus();
      }
    } else {
      let hostSettings = this.hostSettings[hostSettingsId];

      this.startupWindow?.window.close();
      this.createHostWindow(hostSettings);
    }
  }

  releaseHostWindow(hostSettingsId, donePromise) {
    let hostWindow = this.hostWindows[hostSettingsId];

    Promise.resolve(donePromise).then(() => {
      delete this.hostWindows[hostSettingsId];
    });

    if (donePromise) {
      this.pool.add(() => donePromise);
    }

    if (!this.quitting) {
      hostWindow.window.once('closed', () => {
        this.createStartupWindow();
      });
    }
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
        defaultHostSettingsId: null,
        drafts: {},
        hostSettings: {},
        preferences: {},
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
