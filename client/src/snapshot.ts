export type SnapshotWatchCallback<T extends object> = ((snapshot: T) => void);

export abstract class SnapshotProvider<T extends object> implements SnapshotTarget<T> {
  _snapshot: T | null = null;
  _updated: boolean = true;
  _watchers = new Set<SnapshotWatchCallback<T>>();

  protected abstract _createSnapshot(): T;

  getSnapshot() {
    if (this._updated) {
      this._updated = false;
      this._snapshot = this._createSnapshot();
    }

    return this._snapshot!;
  }

  unwatchSnapshot(callback: SnapshotWatchCallback<T>) {
    this._watchers.delete(callback);
  }

  watchSnapshot(callback: SnapshotWatchCallback<T>, options?: { signal?: AbortSignal; }) {
    this._watchers.add(callback);

    options?.signal?.addEventListener('abort', () => {
      this._watchers.delete(callback);
    });
  }

  _update() {
    this._updated = true;

    for (let callback of this._watchers) {
      callback(this.getSnapshot());
    }
  }
}

export interface SnapshotTarget<T extends object> {
  /**
   * Return a snapshot of the object, an immutable object which will remain identical to the previous one returned until the object is updated.
   */
  getSnapshot(): T;

  /**
   * Watch the object for changes.
   */
  watchSnapshot(callback: SnapshotWatchCallback<T>, options?: { signal?: AbortSignal; }): void;
}

export function getRecordSnapshot<T extends { [key: number | string | symbol]: SnapshotTarget<object>; }>(record: T): {
  [K in keyof T]: (T[K] extends SnapshotTarget<infer U> ? U : never)
} {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, value.getSnapshot()])
  ) as any;
}
