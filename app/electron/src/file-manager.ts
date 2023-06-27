import chokidar from 'chokidar';
import { WebContents } from 'electron';
import { Stats } from 'fs';
import fs from 'node:fs/promises';
import { Deferred, defer } from 'pr1-shared';

import { DocumentChange } from './interfaces';
import { rootLogger } from './logger';
import { Pool } from './util';


export interface FileState {
  contents: string | null;
  lastExternalModificationDate: number;
  lastModificationDate: number;
  queryId: number | null;
  queryDeferred: Deferred<void> | null;
  subscriberCount: 0; // Includes windows that are waiting for the file to be written before watching it
  watchers: Set<WebContents>;
}


export type FilePath = string;

export class FileManager {
  private fileLocks = new Map<FilePath, Promise<void>>();
  private fileStates = new Map<FilePath, FileState>();
  private logger = rootLogger.getChild('fileManager');
  private pool = new Pool(this.logger);
  private watcher: chokidar.FSWatcher;

  constructor() {
    this.watcher = chokidar.watch([], {
      awaitWriteFinish: {
        stabilityThreshold: 500
      }
    });

    this.watcher.on('add', (filePath) => {
      this.logger.debug(`Detected new file: ${filePath}`);
      this.pool.add(async () => void await this.detectChange(filePath));
    });

    this.watcher.on('change', (filePath) => {
      this.logger.debug(`Detected changed file: ${filePath}`);
      this.pool.add(async () => void await this.detectChange(filePath));
    });

    this.watcher.on('unlink', (filePath) => {
      this.logger.debug(`Detected deleted file: ${filePath}`);
      this.pool.add(async () => void await this.detectChange(filePath));
    });
  }

  async dispose() {
    this.logger.debug('Disposing');

    this.fileStates.clear();
    await this.watcher.close();
  }

  private async acquireFile(filePath: string) {
    while (this.fileLocks.has(filePath)) {
      await this.fileLocks.get(filePath)!;
    }
  }

  private async lockFile<T>(filePath: string, handler: (() => Promise<T>)): Promise<T> {
    await this.acquireFile(filePath);

    let deferred = defer();
    this.fileLocks.set(filePath, deferred.promise);

    try {
      return await handler();
    } finally {
      deferred.resolve();
      this.fileLocks.delete(filePath);
    }
  }

  private createChange(filePath: string): DocumentChange {
    let fileState = this.fileStates.get(filePath)!;

    return (fileState.contents !== null)
      ? {
        instance: {
          contents: fileState.contents,
          lastExternalModificationDate: fileState.lastExternalModificationDate,
          lastModificationDate: fileState.lastModificationDate
        },
        status: 'ok'
      }
      : {
        instance: null,
        status: 'missing'
      };
  }

  private async detectChange(filePath: string) {
    let fileState = this.fileStates.get(filePath)!;
    let queryId = (fileState.queryId ?? -1) + 1;

    fileState.queryDeferred ??= defer();
    fileState.queryId = queryId;

    await this.lockFile(filePath, async () => {
      if (fileState.queryId !== queryId) {
        return;
      }

      fileState.queryId = null;

      let stats: Stats | null;

      try {
        stats = await fs.stat(filePath);
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          stats = null;
        } else {
          throw err;
        }
      }

      if (fileState.queryId !== null) {
        return;
      }

      fileState.queryDeferred!.resolve();
      fileState.queryDeferred = null;

      let isChange = false;

      if (stats) {
        // If this is an external modification
        if (stats.mtimeMs !== fileState.lastModificationDate) {
          fileState.contents = (await fs.readFile(filePath)).toString();
          fileState.lastModificationDate = stats.mtimeMs;
          fileState.lastExternalModificationDate = stats.mtimeMs;
          isChange = true;
        }
      } else {
        if (fileState.contents !== null) {
          fileState.contents = null;
          fileState.lastModificationDate = 0;
          fileState.lastExternalModificationDate = 0;
          isChange = true;
        }
      }

      if (isChange) {
        let change = this.createChange(filePath);

        for (let watcher of fileState.watchers) {
          watcher.send('drafts.change', filePath, change);
        };
      }
    });
  }

  async unwatchFile(filePath: string, webContents: WebContents) {
    let fileState = this.fileStates.get(filePath);

    if (fileState) {
      fileState.watchers.delete(webContents);
      fileState.subscriberCount -= 1;

      if (fileState.subscriberCount < 1) {
        this.watcher.unwatch(filePath);
        await this.acquireFile(filePath);
      }

      if (fileState.subscriberCount < 1) {
        this.fileStates.delete(filePath);
      }
    }
  }

  async watchFile(filePath: string, webContents: WebContents) {
    let fileState = this.fileStates.get(filePath);

    if (!fileState) {
      fileState = {
        contents: null,
        queryDeferred: null,
        queryId: null,
        lastExternalModificationDate: 0,
        lastModificationDate: 0,
        subscriberCount: 0,
        watchers: new Set()
      };

      this.fileStates.set(filePath, fileState);
    }

    fileState.subscriberCount += 1;

    if (fileState.subscriberCount === 1) {
      await this.detectChange(filePath);
    } else {
      while (fileState.queryDeferred) {
        await fileState.queryDeferred.promise;
      }
    }

    let change = this.createChange(filePath);

    this.watcher.add(filePath);
    fileState.watchers.add(webContents);

    webContents.on('destroyed', () => {
      this.pool.add(async () => void await this.unwatchFile(filePath, webContents));
    });

    return change;
  }

  async writeFile(filePath: FilePath, contents: Buffer | string) {
    let fileState = this.fileStates.get(filePath);
    let queryId = (fileState?.queryId ?? -1) + 1;

    if (fileState) {
      fileState.queryDeferred ??= defer();
      fileState.queryId = queryId;
    }

    await this.lockFile(filePath, async () => {
      if (fileState) {
        fileState.queryId = null;
      }

      await fs.writeFile(filePath, contents);
      let stats = await fs.stat(filePath);

      if (fileState) {
        fileState.contents = contents.toString();
        fileState.lastModificationDate = stats.mtimeMs;

        let change: DocumentChange = {
          instance: {
            contents: null,
            lastExternalModificationDate: fileState.lastExternalModificationDate,
            lastModificationDate: fileState.lastModificationDate
          },
          status: 'ok'
        };

        for (let watcher of fileState.watchers) {
          watcher.send('drafts.change', filePath, change);
        }
      }
    });
  }
}
