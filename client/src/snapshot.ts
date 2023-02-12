export abstract class SnapshotProvider<T extends object> implements SnapshotTarget<T> {
  _snapshot: T | null = null;
  _updated: boolean = true;

  protected abstract _createSnapshot(): T;

  getSnapshot() {
    if (this._updated) {
      this._updated = false;
      this._snapshot = this._createSnapshot();
    }

    return this._snapshot!;
  }

  _update() {
    this._updated = true;
  }
}

export interface SnapshotTarget<T extends object> {
  /**
   * Returns a snapshot of the object, an immutable object which will remain identical to the previous one returned until the object is updated.
   */
  getSnapshot(): T;
}

export function getRecordSnapshot<T extends { [key: number | string | symbol]: SnapshotTarget<object>; }>(record: T): {
  [K in keyof T]: (T[K] extends SnapshotTarget<infer U> ? U : never)
} {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, value.getSnapshot()])
  ) as any;
}
