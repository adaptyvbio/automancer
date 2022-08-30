const { BrowserWindow } = require('electron');
const path = require('path');

const { InternalHost } = require('../internal-host');


exports.HostWindow = class HostWindow {
  constructor(app, hostSettings) {
    this.app = app;
    this.spec = { type: 'local' };

    this.window = new BrowserWindow({
      webPreferences: {
        // additionalArguments: [hostSettings.id],
        preload: path.join(__dirname, 'preload.js')
      }
    });

    this.window.maximize();

    setTimeout(() => {
      this.window.loadFile(__dirname + '/index.html', { query: { hostSettingsId: hostSettings.id } });
    }, 500);

    if ((hostSettings.backendOptions.type === 'internal') && !this.app.internalHost) {
      this.app.internalHost = new InternalHost(this.app);
    }

    this.app.internalHost.addClient(this.window);
  }
};
