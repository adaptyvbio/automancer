import { deserialize, serialize } from '../serialize-immutable';
import { Store } from './base';


export class BrowserStorageStore implements Store {
  constructor(private storage: Storage, private name: string) {

  }

  private prefixKey(key: string) {
    return `${this.name}/${key}`;
  }

  private unprefixKey(prefixedKey: string) {
    let prefix = `${this.name}/`;

    return prefixedKey.startsWith(prefix)
      ? prefixedKey.substring(prefix.length)
      : null;
  }

  async read(key: string) {
    let rawValue = this.storage.getItem(this.prefixKey(key));

    return (rawValue !== null)
      ? deserialize(JSON.parse(rawValue))
      : undefined;
  }

  async * readAll() {
    for (let index = 0; index < this.storage.length; index += 1) {
      let prefixedKey = this.storage.key(index)!;
      let key = this.unprefixKey(prefixedKey);

      if (key !== null) {
        let value = await this.read(key);
        yield [key, value] as const;
      }
    }
  }

  async write(key: string, value: unknown) {
    this.storage.setItem(this.prefixKey(key), JSON.stringify(serialize(value)));
  }
}
