import { get, set } from 'idb-keyval';

import createClient, { BackendCommon } from 'pr1-client';

import 'pr1-client/dist/index.css';


async function main() {
  await navigator.serviceWorker.register('./service-worker.js');

  let pyodide = await loadPyodide();
  window.pyodide = pyodide;

  let options = { mode: 'readwrite' };
  let handle = await get('rootHandle');

  if (!handle) {
    await new Promise((r) => document.body.querySelector('button').addEventListener('click', r));

    handle = await window.showDirectoryPicker(options);

    await handle.requestPermission(options);
    await set('rootHandle', handle);
  } else if ((await handle.queryPermission(options)) !== 'granted') {
    await new Promise((r) => document.body.querySelector('button').addEventListener('click', r));
    await handle.requestPermission(options);
  }



  pyodide.FS.mkdir('/data');

  pyodide.FS.mount({
    mount(options) {
      return pyodide.FS.filesystems.MEMFS.mount(options);
    },
    syncfs(mount, populate, callback) {
      synchronize(null, handle, mount.mountpoint, pyodide.FS, populate).then(callback);
    }
  }, {}, '/data');

  // pyodide.FS.mount(new bfs.EmscriptenFS(pyodide.FS), {}, '/data');

  // pyodide.FS.mkdir('/data/cd');
  // pyodide.FS.writeFile('/data/x', 'foo');

  // pyodide.FS.mkdir('/data/ciao');
  // pyodide.FS.writeFile('/data/ciao/hey', 'foo');

  let sync = (populate) => new Promise((r) => pyodide.FS.syncfs(populate, r));

  await sync(true);
  console.log(fsReadAllFiles('/data'));

  document.querySelector('button').remove();


  class Backend extends BackendCommon {
    async start() {
      let resolve;
      let promise = new Promise((_resolve) => {
        resolve = _resolve;
      });

      pyodide.globals.set('update_state', (state) => {
        this.state = JSON.parse(state);
        // console.log('->', JSON.parse(state));
        resolve();
      });

      await pyodide.loadPackage('micropip');
      await pyodide.runPythonAsync(`
import micropip
await micropip.install('../../host/dist/pr1-0.0.0-py3-none-any.whl')

from pr1 import Host
from pathlib import Path
import appdirs

class DefaultBackend:
  def __init__(self):
    # self.data_dir = Path(appdirs.site_data_dir("PR-1", "Hsn"))
    self.data_dir = Path("/data")
    self.data_dir.mkdir(exist_ok=True)

  def get_data_dir(self):
    return self.data_dir

host = Host(backend=DefaultBackend())

import json
update_state(json.dumps(host.get_state()))`);

      await promise;
    }
  }


  let id = crypto.randomUUID();

  createClient(document.querySelector('#root'), {
    settings: {
      hosts: {
        [id]: {
          id,
          builtin: true,
          disabled: false,
          locked: false,
          name: 'Local host',
          location: {
            type: 'internal',
            Backend
          }
        }
      }
    }
  });
}


function join(...arr) {
  return arr.join('/');
}

// populate = true  : server -> client
// populate = false : client -> server
async function synchronize(serverRoot, serverHandle, clientRoot, clientFs, populate) {
  let syncDir = async (dir, dirHandle) => {
    let entries = {};
    let clientDir = join(clientRoot, dir);

    for (let name of clientFs.readdir(clientDir)) {
      if ((name === '.') || (name === '..')) {
        continue;
      }

      let clientPath = join(clientDir, name);
      let stat = clientFs.stat(clientPath);
      let isDir = clientFs.isDir(stat.mode);

      // console.log(name, stat);

      entries[name] = {
        client: {
          kind: isDir ? 'directory' : 'file',
          modified: stat.mtime
        },
        server: null
      };
    }


    if (dirHandle) {
      for await (const entry of dirHandle.values()) {
        if (entry.name === '.DS_Store') {
          continue;
        }

        let file = (entry.kind === 'file') ? await entry.getFile() : null;

        entries[entry.name] = {
          client: null,
          ...entries[entry.name],
          server: {
            kind: entry.kind,
            modified: file?.lastModified ?? null,
            handle: entry,
            file
          }
        };
      }
    }


    // console.log(dir || '/', entries);

    for (let [name, entry] of Object.entries(entries)) {
      let path = join(dir, name);
      let clientPath = join(clientDir, name);

      if (populate) {
        if (entry.client && (entry.server?.kind !== entry.client.kind)) {
          if (entry.client.kind === 'directory') {
            await syncDir(path, null);
            clientFs.rmdir(clientPath);
          } else {
            await clientFs.unlink(clientPath);
          }

          entry.client = null;
        }

        if (entry.server) {
          if (entry.server.kind === 'directory') {
            if (!entry.client) {
              clientFs.mkdir(clientPath);
            }

            await syncDir(path, entry.server.handle);
          } else if (!entry.client || (entry.client.modified !== entry.server.modified)) {
            clientFs.writeFile(clientPath, new Uint8Array(await entry.server.file.arrayBuffer()));
            clientFs.utime(clientPath, entry.server.modified, entry.server.modified);
          }
        }
      } else {
        if (entry.server && (entry.client?.kind !== entry.server.kind)) {
          await dirHandle.removeEntry(name, { recursive: true });
          entry.server = null;
        }

        if (entry.client) {
          if (entry.client.kind === 'directory') {
            let handle = !entry.server
              ? await dirHandle.getDirectoryHandle(name, { create: true })
              : entry.server.handle;

            await syncDir(path, handle);
          } else {
            let handle = !entry.server
              ? await dirHandle.getFileHandle(name, { create: true })
              : entry.server.handle;

            let writable = await handle.createWritable();
            await writable.write(clientFs.readFile(clientPath));
            await writable.close();

            // -> utime()
          }
        }
      }
    }
  };

  await syncDir('', serverRoot ? await serverHandle.getDirectoryHandle(serverRoot) : serverHandle);
}


main();


function fsReadAllFiles(folder) {
  const files = [];

  function impl(curFolder) {
    for (const name of pyodide.FS.readdir(curFolder)) {
      if (name === '.' || name === '..') continue;

      const path = `${curFolder}/${name}`;
      const { mode, timestamp } = pyodide.FS.lookupPath(path).node;
      if (pyodide.FS.isFile(mode)) {
        files.push({path, timestamp});
      } else if (pyodide.FS.isDir(mode)) {
        impl(path);
      }
    }
  }

  impl(folder);
  return files;
}
