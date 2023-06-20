export interface Store {
  /**
   * Read a value from the store.
   *
   * @param key The key to read.
   * @returns A promise that resolves to the value, or `undefined` if the key does not exist.
   */
  read(key: string): Promise<unknown | undefined>;

  /**
   * Read all values from the store.
   *
   * @returns An async iterable that yields key-value pairs.
   */
  readAll(): AsyncIterable<readonly [string, unknown]>;

  /**
   * Write a value to the store.
   *
   * @param key The key to write.
   * @param value The value to write.
   */
  write(key: string, value: unknown): Promise<void>;
}
