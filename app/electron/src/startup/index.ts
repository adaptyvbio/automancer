import { BrowserWindow } from 'electron';
import path from 'path';

import { CoreApplication } from '..';
import { rootLogger } from '../logger';
import * as util from '../util';


export class StartupWindow {
  closed: Promise<void>;
  window: BrowserWindow;

  private logger = rootLogger.getChild('startupWindow');

  constructor(private app: CoreApplication) {
    this.logger.debug('Constructed and created');

    this.window = new BrowserWindow({
      width: 800,
      height: Math.round(800 / 1.7),
      backgroundColor: '#000000',
      fullscreenable: false,
      resizable: false,
      show: this.app.debug,
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js')
      },
      ...(util.isDarwin
        ? {
          titleBarStyle: 'hiddenInset'
        }
        : {
          titleBarOverlay: {
            color: '#f6f6f6'
          },
          titleBarStyle: 'hidden'
        })
    });

    this.closed = new Promise((resolve) => {
      this.window.on('close', () => {
        this.logger.debug('Closed');
        resolve();
      });
    });

    this.window.loadFile(path.join(__dirname, '../static/startup/index.html'));
  }

  focus() {
    if (this.window.isMinimized()) {
      this.window.restore();
    }

    this.window.focus();
  }
}
