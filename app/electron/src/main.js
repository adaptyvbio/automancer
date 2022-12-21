const chokidar = require('chokidar');
const crypto = require('crypto');
const { BrowserWindow, Menu, app, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');

const { HostWindow } = require('./host');
const { StartupWindow } = require('./startup');
const util = require('./util');


const ProtocolFileFilters = [
  { name: 'Protocols', extensions: ['yml', 'yaml'] }
];


export class CoreApplication {
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

    this.app.on('second-instance', () => {
      this.createStartupWindow();
    });


    if (util.isDarwin) {
      Menu.setApplicationMenu(Menu.buildFromTemplate([
        { role: 'appMenu' },
        { role: 'editMenu' },
        {
          label: 'View',
          submenu: [
            { label: 'Open startup menu',
              click: () => {
                this.createStartupWindow();
              } },
            { type: 'separator' },
            { label: 'Reveal data directory in explorer',
              click: () => {
                shell.showItemInFolder(this.dataDirPath);
              } },
            { label: 'Reveal logs directory in explorer',
              click: () => {
                shell.showItemInFolder(this.logsDirPath);
              } },
            { type: 'separator' },
            { role: 'reload' },
            { role: 'toggleDevTools' }
          ]
        },
        { role: 'windowMenu' },
        { role: 'help' },
        {
          role: 'help',
          submenu: [
            { label: 'Documentation' }
          ]
        }
      ]));
    }
  }

  async createStartupWindow() {
    if (this.startupWindow) {
      this.startupWindow.focus();
    } else {
      this.startupWindow = new StartupWindow(this);

      this.pool.add(async () => {
        await this.startupWindow.closed;
        this.startupWindow = null;

        if (!this.quitting && (Object.keys(this.hostWindows).length < 1)) {
          this.app.quit();
        }
      });
    }
  }

  async createHostWindow(hostSettings) {
    let hostWindow = new HostWindow(this, hostSettings);
    this.hostWindows[hostSettings.id] = hostWindow;

    this.pool.add(async () => {
      await hostWindow.closed;
      delete this.hostWindows[hostSettings.id];

      if (!this.quitting) {
        this.createStartupWindow();
      }
    });
  }

  async initialize() {
    if (!this.app.requestSingleInstanceLock()) {
      this.app.quit();
      return;
    }

    this.localHostModels = await util.getLocalHostModels();
    this.pythonInstallations = await util.findPythonInstallations();
    // console.log(require('util').inspect(this.pythonInstallations, { colors: true, depth: null }));

    await app.whenReady();
    await this.loadData();


    // Window management

    ipcMain.on('ready', (event) => {
      BrowserWindow.fromWebContents(event.sender).show();
    });


    // Context menu creation

    ipcMain.handle('contextMenu.trigger', async (event, { menu, position }) => {
      let deferred = util.defer();

      let createAppMenuFromMenu = (menu, ancestors = []) => Menu.buildFromTemplate(menu.flatMap((entry) => {
        let path = [...ancestors, entry.id];

        switch (entry.type) {
          case undefined:
          case 'option': return [{
            checked: !!entry.checked,
            type: entry.checked ? 'checkbox' : 'normal',
            enabled: !entry.disabled,
            label: entry.name,
            click: () => void deferred.resolve(path)
          }];

          case 'divider': return [{
            type: 'separator'
          }];

          default: return [];
        }
      }));

      let appMenu = createAppMenuFromMenu(menu);

      appMenu.popup({
        callback: () => void deferred.resolve(null),
        x: position.x,
        y: position.y,
        window: BrowserWindow.fromWebContents(event.sender)
      });

      return await deferred.promise;
    });


    // Host settings management

    ipcMain.handle('hostSettings.addRemoteHost', async (_event, options) => {
      let hostSettingsId = crypto.randomUUID();

      await this.setData({
        hostSettings: {
          ...this.data.hostSettings,
          [hostSettingsId]: {
            id: hostSettingsId,
            label: options.label,
            options: {
              type: 'remote',
              auth: options.auth,
              address: options.address,
              port: options.port
            }
          }
        }
      });

      return {
        ok: true,
        id: hostSettingsId
      };
    });

    ipcMain.handle('hostSettings.createLocalHost', async (_event, options) => {
      let pythonInstallation = options.customPythonInstallation ?? this.pythonInstallations[options.pythonInstallationSettings.id];

      let hostSettingsId = crypto.randomUUID();
      let hostDirPath = path.join(this.hostsDirPath, hostSettingsId);
      let envPath = path.join(hostDirPath, 'env');

      let architecture = options.pythonInstallationSettings.architecture;
      let pythonPath = pythonInstallation.path;

      await fs.mkdir(hostDirPath, { recursive: true });

      if (options.pythonInstallationSettings.virtualEnv) {
        await util.runCommand(`"${pythonInstallation.path}" -m venv "${envPath}"`, { architecture, timeout: 60e3 });
        pythonPath = path.join(envPath, 'bin/python');

        let corePackagesDirPath = util.getResourcePath('packages');
        for (let corePackageRelPath of await fs.readdir(corePackagesDirPath)) {
          await util.runCommand(`"${pythonPath}" -m pip install ${path.join(corePackagesDirPath, corePackageRelPath)}`, { architecture, timeout: 60e3 });
        }
      }

      await this.setData({
        hostSettings: {
          ...this.data.hostSettings,
          [hostSettingsId]: {
            id: hostSettingsId,
            label: options.label,
            options: {
              type: 'local',
              architecture: options.pythonInstallationSettings.architecture,
              corePackagesInstalled: options.pythonInstallationSettings.virtualEnv,
              dirPath: hostDirPath,
              id: crypto.randomUUID(),
              pythonPath
            }
          }
        }
      });

      return {
        ok: true,
        id: hostSettingsId
      };
    });

    ipcMain.handle('hostSettings.delete', async (_event, { hostSettingsId }) => {
      let { [hostSettingsId]: deletedHostSettings, ...hostSettings } = this.data.hostSettings;
      await this.setData({ hostSettings });

      if (deletedHostSettings.options.type === 'local') {
        await shell.trashItem(deletedHostSettings.options.dirPath);
      }
    });

    ipcMain.handle('hostSettings.getCreatorContext', async (_event) => {
      // console.log(require('util').inspect(this.pythonInstallations, { colors: true, depth: Infinity }));

      return {
        computerName: os.hostname(),
        pythonInstallations: this.pythonInstallations
      };
    });

    ipcMain.handle('hostSettings.query', async (_event) => {
      return {
        defaultHostSettingsId: this.data.defaultHostSettingsId,
        hostSettings: this.data.hostSettings
      };
    });

    ipcMain.handle('hostSettings.revealLogsDirectory', async (_event, { hostSettingsId }) => {
      let logsDirPath = path.join(this.logsDirPath, hostSettingsId);
      await util.fsMkdir(logsDirPath);

      shell.showItemInFolder(logsDirPath);
    });

    ipcMain.handle('hostSettings.revealSettingsDirectory', async (_event, { hostSettingsId }) => {
      let hostSettings = this.data.hostSettings[hostSettingsId];
      shell.showItemInFolder(hostSettings.options.dirPath);
    });

    ipcMain.handle('hostSettings.selectPythonInstallation', async (event) => {
      let result = await dialog.showOpenDialog(
        BrowserWindow.fromWebContents(event.sender),
        { buttonLabel: 'Select',
          filters: [
            ...(process.platform === 'win32'
              ? [{ name: 'Executables', extensions: ['*.exe'] }]
              : []),
            { name: 'All Files', extensions: ['*'] }
          ],
          properties: ['dontAddToRecent', 'noResolveAliases', 'openFile'] }
      );

      if (result.canceled) {
        return null;
      }

      let installationPath = result.filePaths[0];
      let info = await util.getPythonInstallationInfo(installationPath);

      if (!info) {
        dialog.showErrorBox('Invalid file', 'This file does not correspond to a valid Python installation.');
        return null;
      }

      return {
        id: installationPath,
        info,
        path: installationPath,
        leaf: false,
        symlink: false
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

    let createDraftEntryState = () => ({
      lastModified: null,
      waiting: false,
      watcher: null,
      writePromise: Promise.resolve()
    })

    let draftEntryStates = Object.fromEntries(
      Object.values(this.data.drafts).map((draftEntry) => [draftEntry.id, createDraftEntryState()])
    );

    let createClientDraftEntry = async (draftEntry) => {
      let stats;

      try {
        stats = await fs.stat(draftEntry.path);
      } catch (err) {
        if (err.code === 'ENOENT') {
          return null;
        }

        throw err;
      }

      return {
        id: draftEntry.id,
        lastOpened: draftEntry.lastOpened,
        lastModified: stats.mtimeMs,
        name: draftEntry.name,
        path: path.basename(draftEntry.path)
      };
    };

    ipcMain.handle('drafts.create', async (event, source) => {
      let result = await dialog.showSaveDialog(
        BrowserWindow.fromWebContents(event.sender),
        { filters: ProtocolFileFilters,
          buttonLabel: 'Create' }
      );

      if (result.canceled) {
        return null;
      }

      let draftEntry = {
        id: crypto.randomUUID(),
        lastOpened: Date.now(),
        name: path.basename(result.filePath),
        path: result.filePath
      };

      await fs.writeFile(draftEntry.path, source);

      await this.setData({
        drafts: { ...this.data.drafts, [draftEntry.id]: draftEntry }
      });

      draftEntryStates[draftEntry.id] = createDraftEntryState();

      return createClientDraftEntry(draftEntry);
    });

    ipcMain.handle('drafts.delete', async (_event, draftId) => {
      let { [draftId]: _, ...drafts } = this.data.drafts;
      await this.setData({ drafts });

      delete draftEntryStates[draftId];
    });

    ipcMain.handle('drafts.list', async () => {
      let missingDraftIds = new Set();

      let clientDraftEntries = (await Promise.all(
        Object.values(this.data.drafts).map(async (draftEntry) => {
          let clientDraftEntry = await createClientDraftEntry(draftEntry);

          if (!clientDraftEntry) {
            missingDraftIds.add(draftEntry.id);
            return [];
          }

          return clientDraftEntry;
        })
      )).flat();

      if (missingDraftIds.size > 0) {
        this.setData({
          drafts: Object.fromEntries(
            Object.entries(this.data.drafts).filter(([_draftId, draftEntry]) => !missingDraftIds.has(draftEntry.id))
          )
        });
      }

      return clientDraftEntries;
    });

    ipcMain.handle('drafts.load', async (event) => {
      let result = await dialog.showOpenDialog(
        BrowserWindow.fromWebContents(event.sender),
        { filters: ProtocolFileFilters,
          properties: ['openFile'] }
      );

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

      draftEntryStates[draftEntry.id] = createDraftEntryState();

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

    ipcMain.handle('drafts.watch', async (event, draftId) => {
      let draftEntry = this.data.drafts[draftId];
      let draftEntryState = draftEntryStates[draftId];

      let getChange = async () => {
        let stats = await fs.stat(draftEntry.path);
        let source = (await fs.readFile(draftEntry.path)).toString();

        return {
          lastModified: stats.mtimeMs,
          source
        };
      };

      let watcher = chokidar.watch(draftEntry.path, {
        awaitWriteFinish: {
          stabilityThreshold: 500
        }
      });

      watcher.on('change', () => {
        this.pool.add(async () => {
          if (draftEntryState.waiting) {
            return;
          }

          draftEntryState.waiting = true;
          await draftEntryState.writePromise;

          draftEntryState.waiting = false;

          let change = await getChange();

          if (draftEntryState.lastModified && (change.lastModified > draftEntryState.lastModified)) {
            draftEntryState.lastModified = change.lastModified;
            event.sender.send('drafts.change', { change, draftId });
          }
        });
      });

      draftEntryState.watcher = watcher;

      let change = await getChange();
      draftEntryState.lastModified = change.lastModified;

      return change;
    });

    ipcMain.handle('drafts.watchStop', async (_event, draftId) => {
      let draftEntryState = draftEntryStates[draftId];

      await draftEntryState.watcher.close();
      draftEntryState.watcher = null;
    });

    ipcMain.handle('drafts.write', async (_event, draftId, primitive) => {
      let draftEntry = this.data.drafts[draftId];
      let draftEntryState = draftEntryStates[draftId];

      if (primitive.name) {
        await this.setData({
          drafts: { ...this.data.drafts, [draftEntry.id]: { ...draftEntry, name: primitive.name } }
        });
      }

      if (primitive.source) {
        let promise = draftEntryState.writePromise.then(async () => {
          await fs.writeFile(draftEntry.path, primitive.source);

          let stats = await fs.stat(draftEntry.path);

          draftEntryState.lastModified = stats.mtimeMs;
          return stats.mtimeMs;
        });

        draftEntryState.writePromise = promise;
        return await promise;
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
      if (!existingWindow.closing) {
        this.startupWindow?.window.close();
        existingWindow.focus();
      }
    } else {
      let hostSettings = this.data.hostSettings[hostSettingsId];

      this.startupWindow?.window.close();
      this.createHostWindow(hostSettings);
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
      await this.setData({
        embeddedPythonInstallation: null,
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
