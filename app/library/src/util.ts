import fs from 'node:fs/promises';


export function defer<T = void>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];

  let promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });

  return { promise, resolve, reject };
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(err: any): void;
}


declare const brand: unique symbol;

export type Brand<T, TBrand extends string> = T & {
  [brand]: TBrand;
};


/**
 * Creates an `Error` instance with a `code` property.
 *
 * @param message The error's message.
 * @param code The error's code, such as `APP_FINGERPRINT_MISMATCH`.
 */
export function createErrorWithCode(message: string, code: string) {
  let err = new Error(message);

  // @ts-expect-error
  err.code = code;

  return err;
}


export async function fsMkdir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}
