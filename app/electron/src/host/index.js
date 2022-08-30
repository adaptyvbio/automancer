const { BrowserWindow, dialog } = require('electron');
const path = require('path');

const { InternalHost } = require('../internal-host');


exports.HostWindow = class HostWindow {
  constructor(app, hostSettings) {
    this.app = app;
    this.spec = { type: 'local' };

    this.window = new BrowserWindow({
      show: false,
      webPreferences: {
        // additionalArguments: [hostSettings.id],
        preload: path.join(__dirname, 'preload.js')
      }
    });

    this.window.maximize();
    this.window.hide();
    this.window.loadFile(__dirname + '/index.html', { query: { hostSettingsId: hostSettings.id } });


    this.internalHost = null;

    let closing = false;
    let isHostInternal = (hostSettings.backendOptions.type === 'internal');

    if (isHostInternal) {
      this.internalHost = new InternalHost(this.app, this);

      this.internalHost.closed.then((code) => {
        this.internalHost = null;

        if (code !== 0) {
          dialog.showErrorBox(`Host "${hostSettings.label}" terminated unexpectedly with code ${code}`, 'See the log file for details.');
        }

        if (!closing) {
          closing = true;
          this.window.close();
        }
      });
    }

    this.window.on('close', () => {
      closing = true;

      if (this.internalHost) {
        this.app.releaseHostWindow(hostSettings.id, this.internalHost.closed);
        this.internalHost.close();
      } else {
        this.app.releaseHostWindow(hostSettings.id);
      }
    });
  }
};
