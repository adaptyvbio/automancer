import 'source-map-support/register';

import { ok as assert } from 'assert';
import chokidar from 'chokidar';
import crypto from 'crypto';
import electron, { BrowserWindow, dialog, Menu, MenuItemConstructorOptions, shell } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import { AppData, BridgeTcp, fsExists, HostSettings, HostSettingsId, PythonInstallationRecord, searchForAdvertistedHosts, ServerConfiguration, SocketClientBackend, UnixSocketDirPath } from 'pr1-library';
import * as uol from 'uol';

import { MenuDef, MenuEntryId } from 'pr1';
import { defer } from 'pr1-shared';
import { HostWindow } from './host';
import { DraftEntryState, IPC2d as IPCServer2d } from './interfaces';
import { rootLogger } from './logger';
import type { IPCEndpoint } from './shared/preload';
import { StartupWindow } from './startup';
import * as util from './util';


const ProtocolFileFilters = [
  { name: 'Protocols', extensions: ['yml', 'yaml'] }
];


export class CoreApplication {
  static version = 2;

  private logger = rootLogger.getChild('application');
  private pool = new util.Pool(this.logger);

  private electronApp: electron.App;
  private quitting: boolean;

  private data!: AppData;
  private pythonInstallations!: PythonInstallationRecord;

  private dataDirPath: string;
  private dataPath: string;
  private hostsDirPath: string;
  logsDirPath: string;

  private hostWindows: Record<HostSettingsId, HostWindow> = {};
  private startupWindow: StartupWindow | null = null;

  constructor(electronApp: electron.App) {
    this.electronApp = electronApp;
    this.quitting = false;

    let userData = this.electronApp.getPath('userData');

    this.dataDirPath = path.join(userData, 'App Data');
    this.dataPath = path.join(this.dataDirPath, 'app.json');

    this.hostsDirPath = path.join(userData, 'App Hosts');
    this.logsDirPath = this.electronApp.getPath('logs');


    this.electronApp.on('before-quit', () => {
      this.quitting = true;
    });

    this.electronApp.on('will-quit', (event) => {
      this.logger.debug('Trying to quit');

      if (!this.pool.empty) {
        event.preventDefault();
        this.logger.debug(`Waiting for ${this.pool.size} tasks to settle`);

        this.pool.wait().then(() => {
          this.electronApp.quit();
        });
      }

      this.logger.debug('Quitting');
    });

    this.electronApp.on('window-all-closed', () => {

    });

    this.electronApp.on('second-instance', () => {
      this.createStartupWindow();
    });


    rootLogger
      .use(uol.format())
      .pipe(new uol.ConcatTransformer())
      .pipe(process.stderr);


    if (process.platform === 'darwin') {
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

  get debug() {
    return !this.electronApp.isPackaged;
  }

  async createStartupWindow() {
    if (this.startupWindow) {
      this.startupWindow.focus();
    } else {
      this.startupWindow = new StartupWindow(this);

      this.pool.add(async () => {
        await this.startupWindow!.closed;
        this.startupWindow = null;

        if (!this.quitting && (Object.keys(this.hostWindows).length < 1)) {
          this.electronApp.quit();
        }
      });
    }
  }

  async createHostWindow(hostSettings: HostSettings) {
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
    if (!this.electronApp.requestSingleInstanceLock()) {
      this.electronApp.quit();
      return;
    }

    this.pythonInstallations = await util.findPythonInstallations();

    await this.electronApp.whenReady();
    await this.loadData();

    if (!this.data) {
      this.logger.debug('Aborting initialization');
      this.electronApp.quit();

      return;
    }

    this.logger.info('Initialized');


    let ipcMain = electron.ipcMain as IPCServer2d<IPCEndpoint>;


    // Window management

    ipcMain.on('main.ready', (event) => {
      BrowserWindow.fromWebContents(event.sender)!.show();
    });


    // Context menu creation

    ipcMain.handle('main.triggerContextMenu', async (event, menu, position) => {
      let deferred = defer<MenuEntryId[] | null>();

      let createAppMenuFromMenu = (menu: MenuDef, ancestors: MenuEntryId[] = []) => electron.Menu.buildFromTemplate(menu.flatMap((entry): MenuItemConstructorOptions[] => {
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
        window: BrowserWindow.fromWebContents(event.sender)!
      });

      return await deferred.promise;
    });


    // Host settings management

    ipcMain.handle('hostSettings.addRemoteHost', async (_event, options) => {
      let hostSettingsId = crypto.randomUUID() as HostSettingsId;

      await this.setData({
        hostSettingsRecord: {
          ...this.data.hostSettingsRecord,
          [hostSettingsId]: {
            id: hostSettingsId,
            type: 'tcp',
            label: options.label,
            options: options.options
          }
        }
      });

      return {
        hostSettingsId
      };
    });

    ipcMain.handle('hostSettings.displayCertificateOfRemoteHost', async (event, options) => {
      let result = await SocketClientBackend.test({
        address: {
          host: options.hostname,
          port: options.port
        },
        tls: {
          serverCertificateCheck: true,
          serverCertificateFingerprint: options.fingerprint
        }
      });

      if (result.ok || (result.reason === 'untrusted_server')) {
        await electron.dialog.showCertificateTrustDialog(BrowserWindow.fromWebContents(event.sender)!, {
          certificate: util.transformCertificate(result.tlsInfo!.certificate),
          message: `Certificate of host with address ${options.hostname}:${options.port}`
        });
      } else {
        this.logger.error('Failed to show remote host certificate');
      }
    });

    ipcMain.handle('hostSettings.testRemoteHost', async (_event, options) => {
      this.logger.debug(`Trying to connect to '${options.hostname}:${options.port}'`);

      let result = await SocketClientBackend.test({
        address: {
          host: options.hostname,
          port: options.port
        },
        tls: options.secure
          ? {
            serverCertificateCheck: !options.trusted,
            serverCertificateFingerprint: options.fingerprint
          }
          : null
      });

      if ('tlsInfo' in result) {
        let { tlsInfo, ...rest } = result;

        return {
          ...rest,
          fingerprint: tlsInfo?.fingerprint ?? null
        };
      }

      return result;
    });

    ipcMain.handle('hostSettings.createLocalHost', async (_event, options) => {
      let pythonInstallation = options.customPythonInstallation ?? this.pythonInstallations[options.pythonInstallationSettings.id];

      let hostSettingsId = crypto.randomUUID() as HostSettingsId;
      let hostDirPath = path.join(this.hostsDirPath, hostSettingsId);
      let envPath = path.join(hostDirPath, 'env');

      let architecture = options.pythonInstallationSettings.architecture;
      let pythonPath = pythonInstallation.path;

      this.logger.info(`Creating local host with settings id '${hostSettingsId}'`);
      this.logger.debug('Creating host directory');

      let conf;

      try {
        await fs.mkdir(hostDirPath, { recursive: true });

        if (options.pythonInstallationSettings.virtualEnv) {
          this.logger.debug('Creating virtual environment');

          await util.runCommand(`"${pythonInstallation.path}" -m venv "${envPath}"`, { architecture, timeout: 60e3 });
          pythonPath = path.join(envPath, 'bin/python');

          let corePackagesDirPath = util.getResourcePath('packages');
          for (let corePackageRelPath of await fs.readdir(corePackagesDirPath)) {
            this.logger.debug(`Installing core package '${corePackageRelPath}'`);
            await util.runCommand(`"${pythonPath}" -m pip install ${path.join(corePackagesDirPath, corePackageRelPath)}`, { architecture, timeout: 60e3 });
          }
        }

        this.logger.debug('Initializing host configuration');

        let [confStdout, _] = await util.runCommand(`"${pythonPath}" -m pr1_server --data-dir "${hostDirPath}" --initialize`, { architecture, timeout: 60e3 });
        conf = JSON.parse(confStdout) as ServerConfiguration;
      } catch (err: any) {
        util.logError(err, this.logger);

        return {
          ok: false,
          reason: 'other',
          message: err.message ?? 'Unknown error'
        };
      }

      this.logger.info(`Created host with identifier '${conf.identifier}'`);

      await this.setData({
        hostSettingsRecord: {
          ...this.data.hostSettingsRecord,
          [hostSettingsId]: {
            id: hostSettingsId,
            label: options.label,
            type: 'local',
            options: {
              architecture: options.pythonInstallationSettings.architecture,
              conf,
              corePackagesInstalled: options.pythonInstallationSettings.virtualEnv,
              dirPath: hostDirPath,
              identifier: conf.identifier,
              pythonPath,
              socketPath: path.join(UnixSocketDirPath, conf.identifier)
            }
          } satisfies HostSettings
        }
      });

      return {
        ok: true,
        hostSettingsId
      };
    });

    ipcMain.handle('hostSettings.delete', async (_event, { hostSettingsId }) => {
      let { [hostSettingsId]: deletedHostSettings, ...hostSettingsRecord } = this.data.hostSettingsRecord;
      await this.setData({ hostSettingsRecord });

      if (deletedHostSettings.type === 'local') {
        await shell.trashItem(deletedHostSettings.options.dirPath);
      }
    });

    ipcMain.handle('hostSettings.getHostCreatorContext', async (_event) => {
      // console.log(require('util').inspect(this.pythonInstallations, { colors: true, depth: Infinity }));

      return {
        computerName: util.getComputerName(),
        pythonInstallations: this.pythonInstallations
      };
    });

    ipcMain.handle('hostSettings.list', async (_event) => {
      return {
        defaultHostSettingsId: this.data.defaultHostSettingsId,
        hostSettingsRecord: this.data.hostSettingsRecord
      };
    });

    ipcMain.handle('hostSettings.revealLogsDirectory', async (_event, { hostSettingsId }) => {
      let logsDirPath = path.join(this.logsDirPath, hostSettingsId);
      await fs.mkdir(logsDirPath, { recursive: true });

      shell.showItemInFolder(logsDirPath);
    });

    ipcMain.handle('hostSettings.revealSettingsDirectory', async (_event, { hostSettingsId }) => {
      let hostSettings = this.data.hostSettingsRecord[hostSettingsId];

      assert(hostSettings.type === 'local');
      shell.showItemInFolder(hostSettings.options.dirPath);
    });

    ipcMain.handle('hostSettings.selectPythonInstallation', async (event) => {
      let result = await dialog.showOpenDialog(
        BrowserWindow.fromWebContents(event.sender)!,
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

    ipcMain.handle('hostSettings.queryRemoteHosts', async (_event) => {
      return (await searchForAdvertistedHosts())
        .map((info) => ({
          ...info,
          bridges: info.bridges.filter((bridge): bridge is BridgeTcp => (bridge.type === 'tcp'))
        }))
        .filter((info) => (info.bridges.length > 0))
        .filter((info) =>
          !Object.values(this.data.hostSettingsRecord).some((hostSettings) =>
            (hostSettings.options.identifier === info.identifier)
          )
        );
    });


    // Other

    ipcMain.on('hostSettings.launchHost', async (_event, { hostSettingsId }) => {
      this.launchHost(hostSettingsId);
    });


    // Draft management

    let createDraftEntryState = (): DraftEntryState => ({
      lastModified: null,
      waiting: false,
      watcher: null,
      writePromise: Promise.resolve()
    });

    let draftEntryStates = Object.fromEntries(
      Object.values(this.data.drafts).map((draftEntry) => [draftEntry.id, createDraftEntryState()])
    );

    let createClientDraftEntry = async (draftEntry) => {
      let stats;

      try {
        stats = await fs.stat(draftEntry.path);
      } catch (err: any) {
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
        BrowserWindow.fromWebContents(event.sender)!,
        { filters: ProtocolFileFilters,
          buttonLabel: 'Create' }
      );

      if (result.canceled) {
        return null;
      }

      let draftEntry = {
        id: crypto.randomUUID(),
        lastOpened: Date.now(),
        name: path.basename(result.filePath!),
        path: result.filePath
      };

      await fs.writeFile(draftEntry.path!, source);

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
        BrowserWindow.fromWebContents(event.sender)!,
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

      await draftEntryState.watcher!.close();
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

    ipcMain.handle('host.ready', async (_event, hostSettingsId) => {
      this.hostWindows[hostSettingsId].ready();
    });

    ipcMain.on('host.sendMessage', async (_event, hostSettingsId, message) => {
      this.hostWindows[hostSettingsId].sendMessage(message);
    });


    if (this.data.defaultHostSettingsId) {
      this.launchHost(this.data.defaultHostSettingsId);
    } else {
      this.createStartupWindow();
    }
  }


  launchHost(hostSettingsId: HostSettingsId) {
    this.logger.info(`Launching host settings with id '${hostSettingsId}`);

    let existingWindow = this.hostWindows[hostSettingsId];

    if (existingWindow) {
      if (!existingWindow.closing) {
        this.startupWindow?.window.close();
        existingWindow.focus();
      }
    } else {
      let hostSettings = this.data.hostSettingsRecord[hostSettingsId];

      this.startupWindow?.window.close();
      this.createHostWindow(hostSettings);
    }
  }


  async loadData() {
    this.logger.info('Loading app data');

    await fs.mkdir(this.dataDirPath, { recursive: true });

    if (await fsExists(this.dataPath)) {
      this.logger.debug('Reading app data');

      let buffer = await fs.readFile(this.dataPath);
      let data = JSON.parse(buffer.toString());

      if (data.version !== CoreApplication.version) {
        this.logger.critical(`App version mismatch, found: ${data.version}, current: ${CoreApplication.version}`)
        dialog.showErrorBox('App data version mismatch', 'The app is outdated.');

        return;
      }

      this.data = data;
    } else {
      this.logger.debug('Creating app data');

      await this.setData({
        embeddedPythonInstallation: null,
        defaultHostSettingsId: null,
        drafts: {},
        hostSettingsRecord: {},
        preferences: {},
        version: CoreApplication.version
      });
    }
  }

  async setData(data: Partial<AppData>) {
    this.data = { ...this.data, ...data };
    await fs.writeFile(this.dataPath, JSON.stringify(this.data));
  }
}

async function main() {
  if (require('electron-squirrel-startup')) {
    electron.app.quit();
    return;
  }

  let core = new CoreApplication(electron.app);
  await core.initialize();
}


main().catch((err) => {
  console.error(err);
});
