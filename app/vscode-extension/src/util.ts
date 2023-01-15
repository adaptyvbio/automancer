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


export function findMap<T, S>(arr: T[], fn: (item: T, index: number, arr: T[]) => S | null) : S | undefined {
  for (let [index, item] of arr.entries()) {
    let value = fn(item, index, arr);

    if (value) {
      return value;
    }
  }

  return undefined;
}
