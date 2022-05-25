import { loadPyodide } from 'pyodide/pyodide';

import { LocalBackendStorage } from '..';
import { HostState } from './common';
import { MessageBackend } from './message';


// interface Pyodide {
//   FS: FS & {
//     filesystems: {
//       IDBFS: RegularFS;
//       MEMFS: RegularFS;
//       PROXYFS: RegularFS;
//     };

//     mount(fs: {
//       mount(options: {}): RegularFS;
//       syncfs(mount: { mountpoint: string; }, populate: boolean, callback: (err?: any) => void): void;
//     }, options: {}, path: string): void;
//   };
// }

interface FS {
  isDir(mode: number): boolean;
  mkdir(path: string): void;
  readdir(path: string): string[];
  readFile(path: string): Uint8Array;
  rmdir(path: string): void;
  syncfs(populate: boolean, callback: (err?: any) => void): void;
  stat(path: string): {
    mode: number;
    mtime: number;
  };
  unlink(path: string): void;
  utime(path: string, time1: number, time2: number): void;
  writeFile(path: string, contents: Uint8Array): void;

  // mount(fs: RegularFS, options: {
  //   root: string;
  //   fs: RegularFS;
  // }): RegularFS;
}

// interface RegularFS extends FS {
//   mount(options: {}): RegularFS;
// }

// declare global {
//   interface Window {
//     loadPyodide(): Promise<Pyodide>;
//   }
// }


export interface PyodideBackendOptions {
  id: string;
  storage: LocalBackendStorage;

  // storage: {
  //   type: 'filesystem';
  //   handle: FileSystemDirectoryHandle;
  // } | {
  //   type: 'persistent';
  // } | {
  //   type: 'memory';
  // };
}

export class PyodideBackend extends MessageBackend {
  options: PyodideBackendOptions;

  constructor(options: PyodideBackendOptions) {
    super();

    this.options = options;
  }

  async start() {
    // console.trace();

    let pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.20.0/full'
    });

    let mountPath = `/data/${this.options.id}`;
    let storage = this.options.storage;

    pyodide.FS.mkdir('/data');
    pyodide.FS.mkdir(mountPath);

    switch (storage.type) {
      case 'filesystem': {
        let handle = storage.handle;

        pyodide.FS.mount({
          mount(options: unknown) {
            return pyodide.FS.filesystems.MEMFS.mount(options);
          },
          syncfs(mount: { mountpoint: string; }, populate: boolean, callback: (err?: any) => void) {
            synchronize(null, handle, mount.mountpoint, pyodide.FS, populate).then(() => {
              callback();
            }, (err) => {
              callback(err);
            });
          }
        }, {}, mountPath);

        break;
      }

      case 'persistent': {
        pyodide.FS.mount(pyodide.FS.filesystems.IDBFS, mountPath);

        break;
      }

      case 'memory': {

      }
    }


    // TODO: set as method
    let sync = (populate: boolean): Promise<void> => new Promise((resolve, reject) => pyodide.FS.syncfs(populate, (err?: any) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    }));

    // function fsReadAllFiles(folder) {
    //   const files = [];

    //   function impl(curFolder) {
    //     for (const name of pyodide.FS.readdir(curFolder)) {
    //       if (name === '.' || name === '..') continue;

    //       const path = `${curFolder}/${name}`;
    //       const { mode, timestamp } = pyodide.FS.lookupPath(path).node;
    //       if (pyodide.FS.isFile(mode)) {
    //         files.push({path, timestamp});
    //       } else if (pyodide.FS.isDir(mode)) {
    //         impl(path);
    //       }
    //     }
    //   }

    //   impl(folder);
    //   return files;
    // }


    await sync(true);

    // console.log(fsReadAllFiles(mountPath));


    let resolve!: () => void;
    let promise = new Promise<void>((_resolve) => {
      resolve = _resolve;
    });

    pyodide.globals.set('update_state', (state: string) => {
      this.state = JSON.parse(state);
      console.log('->', JSON.parse(state));
      resolve();
    });

    await pyodide.loadPackage('micropip');
    await pyodide.runPythonAsync(`
import micropip
await micropip.install('../host/dist/pr1-0.0.0-py3-none-any.whl')

from pr1 import Host
from pathlib import Path

class Backend:
  def __init__(self):
    self.data_dir = Path("${mountPath}")

  def get_data_dir(self):
    return self.data_dir

host = Host(backend=Backend())

import json
update_state(json.dumps(host.get_state()))`);

    await promise;
    await sync(false);

    await pyodide.runPythonAsync(`print(host)`);
  }

  protected _send(message: unknown) {

  }
}


function join(...arr: string[]): string {
  return arr.join('/');
}


async function synchronize(serverRoot: string | null, serverHandle: FileSystemDirectoryHandle, clientRoot: string, clientFs: FS, populate: boolean) {
  interface Entry {
    client: {
      kind: 'directory' | 'file';
      modified: number;
    } | null;
    server: {
      kind: 'directory';
      modified: null;
      file: null;
      handle: FileSystemDirectoryHandle;
    } | {
      kind: 'file';
      modified: number;
      file: File;
      handle: FileSystemFileHandle;
    } | null;
  }

  let syncDir = async (dir: string, dirHandle: FileSystemDirectoryHandle | null) => {
    let entries: Record<string, Entry> = {};
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
          ...(entries[entry.name] as Entry | undefined),
          server: {
            kind: entry.kind,
            modified: file?.lastModified ?? null,
            handle: entry,
            file
          } as Entry['server']
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

            await syncDir(path, entry.server.handle as FileSystemDirectoryHandle);
          } else if (!entry.client || (entry.client.modified !== entry.server.modified)) {
            clientFs.writeFile(clientPath, new Uint8Array(await entry.server.file.arrayBuffer()));
            clientFs.utime(clientPath, entry.server.modified, entry.server.modified);
          }
        }
      } else {
        if (entry.server && (entry.client?.kind !== entry.server.kind)) {
          await dirHandle!.removeEntry(name, { recursive: true });
          entry.server = null;
        }

        if (entry.client) {
          if (entry.client.kind === 'directory') {
            let handle = !entry.server
              ? await dirHandle!.getDirectoryHandle(name, { create: true })
              : entry.server.handle;

            await syncDir(path, handle as FileSystemDirectoryHandle);
          } else {
            let handle = !entry.server
              ? await dirHandle!.getFileHandle(name, { create: true })
              : entry.server.handle;

            let writable = await (handle as FileSystemFileHandle).createWritable();
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
