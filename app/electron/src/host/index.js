const { BrowserWindow, dialog } = require('electron');
const path = require('path');

const { InternalHost } = require('../internal-host');
const { Pool } = require('../util');


exports.HostWindow = class HostWindow {
  pool = new Pool();

  constructor(coreApp, hostSettings) {
    this.app = coreApp;
    this.hostSettings = hostSettings;

    this.internalHost = null;
    this.window = null;

    this.pool.add(() => this.start());
  }

  async start() {
    this.internalHost = null;

    let closing = false;
    let isHostInternal = ['alpha', 'beta'].includes(this.hostSettings.backendOptions.type);

    if (isHostInternal) {
      this.internalHost = new InternalHost(this.app, this, this.hostSettings);
      await this.internalHost.start();

      this.internalHost.closed.then((code) => {
        this.internalHost = null;

        if (code !== 0) {
          dialog.showErrorBox(`Host "${this.hostSettings.label}" terminated unexpectedly with code ${code}`, 'See the log file for details.');
        }

        if (!closing) {
          closing = true;
          this.window.close();
        }
      });
    }


    this.window = new BrowserWindow({
      show: false,
      webPreferences: {
        // additionalArguments: [hostSettings.id],
        preload: path.join(__dirname, 'preload.js')
      }
    });

    this.window.maximize();
    this.window.hide();
    this.window.loadFile(__dirname + '/index.html', { query: { hostSettingsId: this.hostSettings.id } });

    this.window.on('close', () => {
      closing = true;

      if (this.internalHost) {
        this.app.releaseHostWindow(this.hostSettings.id, this.internalHost.closed);
        this.internalHost.close();
      } else {
        this.app.releaseHostWindow(this.hostSettings.id);
      }
    });
  }
};
