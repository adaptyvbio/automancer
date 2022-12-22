import { BrowserWindow, dialog } from 'electron';
import * as path from 'path';

import { HostSettings } from '../interfaces';
import { LocalHost } from '../local-host';
import { CoreApplication } from '../main';
import { defer, Pool } from '../util';


export class HostWindow {
  private closed: Promise<void>;
  private closing = false;
  private localHost: LocalHost | null = null;
  private logger = this.app.logger.getChild(['hostWindow', this.hostSettings.id.slice(0, 8)]);
  private pool = new Pool();
  window!: BrowserWindow;

  private closingDeferred = defer<void>();

  constructor(private app: CoreApplication, private hostSettings: HostSettings) {
    this.pool.add(async () => {
      await this.closingDeferred.promise;
      this.closing = true;
    });

    this.pool.add(() => this.start());
    this.closed = this.pool.wait();

    this.logger.debug('Created');
  }

  private async start() {
    this.localHost = null;

    if (this.hostSettings.options.type === 'local') {
      this.logger.debug('Starting the corresponding local host');

      this.localHost = new LocalHost(this.app, this, this.hostSettings);
      await this.localHost.start();

      this.localHost.closed.then((err) => {
        this.localHost = null;

        if (err) {
          dialog.showErrorBox(`Host "${this.hostSettings.label}" terminated unexpectedly` + (err.code ? ` with code ${err.code}` : ''), 'See the log file for details.');
        }

        if (!this.closing) {
          this.closingDeferred.resolve();
          this.window!.close();
        }
      });
    }


    this.logger.debug('Creating the Electron window');

    this.window = new BrowserWindow({
      // show: false,
      titleBarStyle: 'hiddenInset',
      webPreferences: {
        preload: path.join(__dirname, '../preload/host/preload.js')
      }
    });

    this.window.maximize();
    // this.window.hide();
    this.window.loadFile(path.join(__dirname, '../static/host/index.html'), { query: { hostSettingsId: this.hostSettings.id } });

    this.window.on('close', () => {
      this.closingDeferred.resolve();

      if (this.localHost) {
        this.pool.add(this.localHost.closed);
        this.localHost.close();
      }
    });
  }

  focus() {
    if (this.window.isMinimized()) {
      this.window.restore();
    }

    this.window.focus();
  }
}
