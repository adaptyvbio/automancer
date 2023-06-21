import { Deferred, defer } from './defer';


export class Lock {
  #candidates: Deferred<void>[] = [];
  #locked = false;

  constructor(options?: { signal?: AbortSignal; }) {
    options?.signal?.addEventListener('abort', () => {
      for (let deferred of this.#candidates) {
        deferred.reject(new Error('Aborted'));
      }
    });
  }

  async acquire(options?: { signal?: AbortSignal; }) {
    if (this.#locked) {
      let deferred = defer<void>();
      this.#candidates.push(deferred);

      options?.signal?.addEventListener('abort', () => {
        this.#candidates.splice(this.#candidates.indexOf(deferred), 1);
      });

      await deferred.promise;
    }

    return () => {
      let deferred = this.#candidates.shift()!;

      if (deferred) {
        deferred.resolve();
      } else {
        this.#locked = false;
      }
    };
  }

  async acquireWith<T = void>(fn: (() => Promise<T> | T)) {
    let controller = new AbortController();

    await this.acquire();

    try {
      return await fn();
    } finally {
      controller.abort();
    }
  }

  get locked() {
    return this.#locked;
  }
}
