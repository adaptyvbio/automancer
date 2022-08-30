exports.Pool = class Pool {
  constructor() {
    this._promises = new Set();
  }

  add(promise) {
    promise.finally(() => {
      this._promises.delete(promise);
    });

    this._promises.add(promise);
  }

  get empty() {
    return (this._promises.size < 1);
  }

  async wait() {
    while (!this.empty) {
      await Promise.allSettled(this._promises);
    }
  }
};
