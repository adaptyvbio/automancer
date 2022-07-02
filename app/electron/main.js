const { BrowserWindow, app, ipcMain } = require('electron');
const readline = require('readline');
const path = require('path');
const childProcess = require('child_process');


let clients = [];

const createWindow = () => {
  let win = new BrowserWindow({
    // width: 800,
    // height: 600,
    // titleBarStyle: 'hiddenInset'
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  clients.push({ ready: false, window: win });

  win.maximize();
  win.loadFile('index.html');
  win.webContents.openDevTools();
};

app.whenReady().then(() => {
  let proc = childProcess.spawn(
    app.isPackaged
      ? path.join(process.resourcesPath, 'host/main')
      : path.join(__dirname, 'tmp/host/main')
  );

  let rl = readline.createInterface({
    input: proc.stdout,
    crlfDelay: Infinity
  });

  let stateMessage = null;

  (async () => {
    for await (const msg of rl) {
      let message = JSON.parse(msg);

      for (let client of clients) {
        if (client.ready) {
          client.window.webContents.send('host:message', message);
        }
      }

      if (message.type === 'state') {
        stateMessage = message;
      }
    }
  })();

  proc.on('close', (code) => {
    // console.log(`child process exited with code ${code}`);
    app.exit(1);
  });


  ipcMain.on('ready', (event) => {
    let client = clients.find((client) => client.window.webContents === event.sender);
    client.ready = true;

    if (stateMessage !== null) {
      event.sender.send('host:message', stateMessage);
    }
  });

  ipcMain.on('host:message', (event, message) => {
    proc.stdin.write(JSON.stringify(message) + '\n');
  });

  createWindow();
}, (err) => {
  console.error(err);
});
