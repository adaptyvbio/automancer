import { BrowserWindow, dialog } from 'electron';
import * as path from 'path';
import assert from 'assert';

import { CoreApplication } from '..';
import { Pool } from '../util';
import { rootLogger } from '../logger';
import { Client, ClientProtocol, ServerProtocol } from 'pr1-shared';
import { createClient, HostSettings } from 'pr1-library';


export class HostWindow {
  client: Client | null = null;
  closed: Promise<void>;
  closing = false;
  window: BrowserWindow | null = null;

  private logger = rootLogger.getChild(['hostWindow', this.hostSettings.id.slice(0, 8)]);
  private pool = new Pool();

  constructor(private app: CoreApplication, private hostSettings: HostSettings) {
    this.logger.debug('Constructed');

    this.pool.add(() => this.start());
    this.closed = this.pool.wait();
  }

  private async start() {
    this.logger.debug('Creating client');

    let result = await createClient(this.hostSettings, this.logger.getChild('host'), {
      logsDirPath: this.app.logsDirPath
    });

    if (!result.ok) {
      this.logger.error('Failed to create client');
      dialog.showErrorBox('Failed to connect to setup', `Reason: ${result.reason}`);
      return;
    }

    this.logger.debug('Created client');

    this.client = result.client;
    this.client?.onMessage((message) => {
      this.window!.webContents.send('localHost.message', message);
    });

    this.pool.add(this.client!.start());

    result.closed.then(() => {
      if (!this.closing) {
        dialog.showErrorBox(`Host "${this.hostSettings.label}" terminated unexpectedly`, 'See the log file for details.');
      }
    });


    // this.localHost = null;

    // if (this.hostSettings.type === 'local') {
    //   this.logger.debug('Starting the corresponding local host');

    //   this.localHost = new LocalHost(this.app, this, this.hostSettings);

    //   let waitClosed = async () => {
    //     let err = await this.localHost!.closed;

    //     this.localHost = null;

    //     if (err) {
    //       dialog.showErrorBox(`Host "${this.hostSettings.label}" terminated unexpectedly with code ${err.code}`, 'See the log file for details.');
    //       // let { response } = await dialog.showMessageBox(this.window, {
    //       //   message: `Host "${this.hostSettings.label}" terminated unexpectedly`,
    //       //   buttons: ['Ok', 'Open log file'],
    //       //   title: 'Error',
    //       //   defaultId: 0,
    //       //   detail: err.code ? `Code: ${err.code}` : undefined
    //       // });
    //     }

    //     if (!this.closing) {
    //       this.closingDeferred.resolve();
    //       this.window?.close();
    //     }
    //   };

    //   if (!(await this.localHost.start())) {
    //     this.logger.debug('Aborting window creation');
    //     await waitClosed();

    //     return;
    //   }

    //   this.pool.add(waitClosed);
    // }


    this.logger.debug('Creating the Electron window');

    this.window = new BrowserWindow({
      show: !this.app.debug,
      titleBarStyle: 'hiddenInset',
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js')
      }
    });

    this.window.maximize();

    if (!this.app.debug) {
      this.window.hide();
    }

    this.window.loadFile(path.join(__dirname, '../static/host/index.html'), { query: { hostSettingsId: this.hostSettings.id } });

    this.window.on('close', () => {
      this.closing = true;

      this.pool.add(this.client!.closed);
      this.client!.close();
    });
  }

  focus() {
    assert(this.window);

    if (this.window.isMinimized()) {
      this.window.restore();
    }

    this.window.focus();
  }

  ready() {
    this.logger.debug('Sending initialization and initial state messages');

    this.window!.webContents.send('host.message', {
      type: 'initialize',
      identifier: this.client!.identifier!,
      version: this.client!.version!
    } satisfies ServerProtocol.InitializationMessage);

    this.window!.webContents.send('host.message', {
      type: 'state',
      data: this.client!.state!
    } satisfies ServerProtocol.StateMessage);
  }

  sendMessage(message: ClientProtocol.Message) {
    this.client!.sendRawMessage(message);
  }
}
