export interface Store {
  read(key: string): Promise<unknown | undefined>;
  readAll(): AsyncIterable<readonly [string, unknown]>;
  write(key: string, value: unknown): Promise<void>;
}
