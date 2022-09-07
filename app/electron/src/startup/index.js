const { BrowserWindow, Menu, app, ipcMain, shell } = require('electron');
const path = require('path');


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
      titleBarStyle: 'hiddenInset',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js')
      }
    });

    this.closed = new Promise((resolve) => {
      this.window.on('close', () => {
        resolve();
      });
    });

    this.window.loadFile(__dirname + '/index.html');


    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { label: 'Reveal data directory',
            click: () => {
              shell.showItemInFolder(this.app.dataDirPath);
            } },
          { label: 'Reveal logs directory',
            click: () => {
              shell.showItemInFolder(this.app.logsDirPath);
            } }
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

  focus() {
    if (this.window.isMinimized()) {
      this.window.restore();
    }

    this.window.focus();
  }
};
