const { BrowserWindow } = require('electron');
const path = require('path');

const util = require('../util');


exports.StartupWindow = class StartupWindow {
  constructor(coreApp) {
    this.app = coreApp;

    this.window = new BrowserWindow({
      width: 800,
      height: 450,
      backgroundColor: '#000000',
      fullscreenable: false,
      resizable: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js')
      },
      ...(util.isDarwin
        ? {
          titleBarStyle: 'hiddenInset'
        }
        : {
          titleBarOverlay: {
            color: '#e7e3e6'
          },
          titleBarStyle: 'hidden'
        })
    });

    this.closed = new Promise((resolve) => {
      this.window.on('close', () => {
        resolve();
      });
    });

    this.window.loadFile(__dirname + '/index.html');
  }

  focus() {
    if (this.window.isMinimized()) {
      this.window.restore();
    }

    this.window.focus();
  }
};
