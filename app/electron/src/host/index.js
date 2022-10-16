const { BrowserWindow, dialog } = require('electron');
const path = require('path');

const { InternalHost } = require('../internal-host');
const { Pool, defer } = require('../util');


exports.HostWindow = class HostWindow {
  closing = false;
  pool = new Pool();

  _closingDeferred = defer();

  constructor(coreApp, hostSettings) {
    this.app = coreApp;
    this.hostSettings = hostSettings;

    this.internalHost = null;
    this.window = null;

    this.pool.add(async () => {
      await this._closingDeferred.promise;
      this.closing = true;
    });

    this.pool.add(() => this.start());
    this.closed = this.pool.wait();
  }

  async start() {
    this.internalHost = null;

    let isHostInternal = ['alpha', 'beta'].includes(this.hostSettings.backendOptions.type);

    if (isHostInternal) {
      this.internalHost = new InternalHost(this.app, this, this.hostSettings);
      await this.internalHost.start();

      this.internalHost.closed.then((err) => {
        this.internalHost = null;

        if (err) {
          dialog.showErrorBox(`Host "${this.hostSettings.label}" terminated unexpectedly` + (err.code ? ` with code ${err.code}` : ''), 'See the log file for details.');
        }

        if (!this.closing) {
          this._closingDeferred.resolve();
          this.window.close();
        }
      });
    }


    this.window = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/host/preload.js')
      }
    });

    this.window.maximize();
    this.window.hide();
    this.window.loadFile(path.join(__dirname, '../static/host/index.html'), { query: { hostSettingsId: this.hostSettings.id } });

    this.window.on('close', () => {
      this._closingDeferred.resolve();

      if (this.internalHost) {
        this.pool.add(async () => await this.internalHost.closed);
        this.internalHost.close();
      }
    });
  }

  focus() {
    if (this.window.isMinimized()) {
      this.window.restore();
    }

    this.window.focus();
  }
};
