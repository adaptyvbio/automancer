const chokidar = require('chokidar');
const crypto = require('crypto');
const { BrowserWindow, app, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const { HostWindow } = require('./host');
const { StartupWindow } = require('./startup');
const util = require('./util');


class CoreApplication {
  static version = 1;

  pool = new util.Pool();

  constructor(coreApp) {
    this.app = coreApp;
    this.quitting = false;

    let userData = this.app.getPath('userData');

    this.data = null;
    this.dataDirPath = path.join(userData, 'App Data');
    this.dataPath = path.join(this.dataDirPath, 'app.json');

    this.hostsDirPath = path.join(userData, 'App Hosts');
    this.logsDirPath = this.app.getPath('logs');

    this.startupWindow = null;
    this.hostWindows = {};

    this.localHostModels = null;
    this.pythonInstallations = null;

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

    this.app.on('window-all-closed', () => {

    });
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
    this.localHostModels = await util.getLocalHostModels();
    this.pythonInstallations = await util.findPythonInstallations();

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
        hostSettings: Object.fromEntries(
          Object.entries(this.data.hostSettings).map(([hostSettingsId, hostSettings]) => {
            let backendOptions = (() => {
              switch (hostSettings.backendOptions.type) {
                case 'alpha':
                  return { type: 'internal', id: hostSettings.id, model: 'alpha' };
                case 'beta':
                  return { type: 'internal', id: hostSettings.id, model: 'beta' };
                default:
                  return hostSettings.backendOptions;
              }
            })();

            return [hostSettingsId, { ...hostSettings, backendOptions }];
          })
        )
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

    ipcMain.handle('drafts.create', async (_event, source) => {
      let result = await dialog.showSaveDialog();

      if (result.canceled) {
        return null;
      }

      let id = crypto.randomUUID();
      let draftEntry = {
        id,
        lastOpened: Date.now(),
        name: path.basename(result.filePath),
        path: result.filePath
      };

      await fs.writeFile(draftEntry.path, source);

      await this.setData({
        drafts: { ...this.data.drafts, [draftEntry.id]: draftEntry }
      });

      return createClientDraftEntry(draftEntry);
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
      let hostSettings = this.data.hostSettings[hostSettingsId];

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

    if (await util.fsExists(this.dataPath)) {
      let buffer = await fs.readFile(this.dataPath);
      this.data = JSON.parse(buffer.toString());

      if (this.data.version !== CoreApplication.version) {
        throw new Error('App version mismatch');
      }
    } else {
      let data = {
        defaultHostSettingsId: null,
        drafts: {},
        hostSettings: {},
        preferences: {},
        version: CoreApplication.version
      };

      let alphaModel = this.localHostModels.alpha;
      let betaModel = this.localHostModels.beta;

      if (alphaModel) {
        let hostSettingsId = crypto.randomUUID();
        let hostDataDirPath = path.join(this.hostsDirPath, hostSettingsId);

        data.hostSettings[hostSettingsId] = {
          id: hostSettingsId,
          builtin: true,
          label: 'Main setup',
          backendOptions: {
            type: 'alpha',
            dataDirPath: hostDataDirPath
          }
        };
      }

      if (betaModel) {
        let pythonInstallation = this.pythonInstallations.find((installation) =>
          (installation.version[0] === betaModel.version[0])
          && (installation.version[1] >= betaModel.version[1])
        );

        if (pythonInstallation) {
          let hostSettingsId = crypto.randomUUID();
          let hostDataDirPath = path.join(this.hostsDirPath, hostSettingsId);

          data.hostSettings[hostSettingsId] = {
            id: hostSettingsId,
            builtin: true,
            label: 'Development setup',
            backendOptions: {
              type: 'beta',
              dataDirPath: hostDataDirPath,
              pythonLocation: pythonInstallation.location
            }
          };
        }
      }

      await this.setData(data);
    }
  }

  async setData(data) {
    this.data = { ...this.data, ...data };
    await fs.writeFile(this.dataPath, JSON.stringify(this.data));
  }
}

async function main() {
  if (require('electron-squirrel-startup')) {
    app.quit();
    return;
  }

  let core = new CoreApplication(app);
  await core.initialize();
}


main().catch((err) => {
  console.error(err);
});
