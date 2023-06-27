import { BrowserWindow, dialog, session } from 'electron';
import * as path from 'path';
import { HostSettings, createClient } from 'pr1-library';
import { Client, ClientProtocol, ServerProtocol } from 'pr1-shared';

import { CoreApplication } from '..';
import { rootLogger } from '../logger';
import { Pool } from '../util';


export class HostWindow {
  browserWindow: BrowserWindow | null = null;
  client: Client | null = null;
  closed: Promise<void>;
  closing = false;

  // @ts-expect-error
  private logger = rootLogger.getChild(['hostWindow', this.hostSettings.id.slice(0, 8)]);
  private pool = new Pool();

  constructor(private app: CoreApplication, public hostSettings: HostSettings) {
    this.logger.debug('Constructed');

    this.pool.add(() => this.start());
    this.closed = this.pool.wait();
  }

  private async start() {
    this.logger.debug('Creating client');

    let result = await createClient(this.hostSettings, this.logger.getChild('host'), {
      logsDirPath: this.app.hostsLogsDirPath
    });

    if (!result.ok) {
      this.logger.error('Failed to create client');
      dialog.showErrorBox('Failed to connect to setup', `Reason: ${result.reason}`);
      return;
    }

    this.logger.debug('Created client');

    this.client = result.client as Client;
    this.client.onMessage((message) => {
      this.browserWindow?.webContents.send('host.message', message);
    });

    this.pool.add(this.client!.start());

    this.pool.add(async () => {
      let failed = false;

      try {
        await this.client!.closed;
      } catch (err) {
        console.error(err);
        failed = true;
      }

      if (!this.closing || failed) {
        dialog.showErrorBox(`Host "${this.hostSettings.label}" terminated unexpectedly`, 'See the log file for details.');
      }

      this.closing = true;

      if (!this.app.debug) {
        this.browserWindow?.close();
      }
    });


    this.logger.debug('Creating the Electron window');

    this.browserWindow = new BrowserWindow({
      show: this.app.debug,
      ...((process.platform === 'darwin')
        ? {
          titleBarStyle: 'hiddenInset'
        }
        : {
          titleBarOverlay: { color: '#efefef' },
          titleBarStyle: 'hidden'
        }),
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js')
      }
    });

    this.browserWindow.maximize();

    if (!this.app.debug) {
      this.browserWindow.hide();
    }

    this.browserWindow.loadFile(path.join(__dirname, '../static/host/index.html'), { query: { hostSettingsId: this.hostSettings.id } });

    this.browserWindow.on('close', () => {
      this.browserWindow = null;

      if (!this.closing) {
        this.closing = true;

        this.pool.add(this.client!.closed);
        this.client!.close();
      }
    });
  }

  focus() {
    if (this.browserWindow) {
      if (this.browserWindow.isMinimized()) {
        this.browserWindow.restore();
      }

      this.browserWindow.focus();
    }
  }

  ready() {
    this.logger.debug('Sending initialization and initial state messages');

    this.browserWindow!.webContents.send('host.message', {
      type: 'initialize',
      ...this.client!.initializationData!
    } satisfies ServerProtocol.InitializationMessage);

    this.browserWindow!.webContents.send('host.message', {
      type: 'state',
      data: this.client!.state!
    } satisfies ServerProtocol.StateMessage);
  }

  sendMessage(message: ClientProtocol.Message) {
    this.client!.sendRawMessage(message);
  }
}
