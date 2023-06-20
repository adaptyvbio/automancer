import { Store } from './base';


export class MemoryStore implements Store {
  private _entries = new Map<string, unknown>();

  async read(key: string) {
    return this._entries.get(key);
  }

  async * readAll() {
    for (let [key, value] of this._entries) {
      yield [key, value] as const;
    }
  }

  async write(key: string, value: unknown) {
    this._entries.set(key, value);
  }
}
