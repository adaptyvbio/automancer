import { deserialize, serialize } from '../serialize-immutable';
import { Store } from './base';


export class BrowserStorageStore implements Store {
  constructor(private storage: Storage) {

  }

  async read(key: string) {
    let rawValue = this.storage.getItem(key);

    return (rawValue !== null)
      ? deserialize(JSON.parse(rawValue))
      : undefined;
  }

  async * readAll() {
    for (let index = 0; index < this.storage.length; index += 1) {
      let key = this.storage.key(index)!;
      let value = await this.read(key);

      yield [key, value] as const;
    }
  }

  async write(key: string, value: unknown) {
    this.storage.setItem(key, JSON.stringify(serialize(value)));
  }
}
