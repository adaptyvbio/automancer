import { List, fromJS, is, Set as ImSet } from 'immutable';
import { ReactNode, useEffect, useRef, useState } from 'react';


export function assert(condition: unknown): asserts condition {
  if (!condition) {
    throw new Error('Assertion error');
  }
}

export function deepEqual(a: unknown, b: unknown): boolean {
  return is(fromJS(a), fromJS(b));
}

export function findCommon<T>(arr: Iterable<T>): T | null {
  let value!: T;
  let valueSet = false;

  for (let item of arr) {
    if (valueSet) {
      if (item !== value) {
        return null;
      }
    } else {
      value = item;
      valueSet = true;
    }
  }

  return value;
}


export function findLastEntry<T>(arr: T[], fn: (item: T, index: number, arr: T[]) => unknown): [number, T] | undefined {
  for (let index = arr.length - 1; index >= 0; index -= 1) {
    if (fn(arr[index], index, arr)) {
      return [index, arr[index]];
    }
  }

  return undefined;
}


export function findMap<T, S>(arr: T[], fn: (item: T, index: number, arr: T[]) => S | null): S | undefined {
  for (let [index, item] of arr.entries()) {
    let value = fn(item, index, arr);

    if (value) {
      return value;
    }
  }

  return undefined;
}

export function findWithIndex<T>(arr: T[], fn: (item: T, index: number, arr: T[]) => unknown): readonly [number, T] | null {
  let index = arr.findIndex(fn);

  return (index >= 0)
    ? [index, arr[index]] as const
    : null;
}


export function usePrevious<T>(value: T): T | undefined {
  let ref = useRef<T>();

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

export function useForceUpdate() {
  let [_, setValue] = useState(0);
  return () => void setValue(value => value + 1);
}


export function formatClass(...input: (Record<string, unknown> | string | undefined)[]): string {
  return input
    .filter((item) => item)
    .flatMap((item) => {
      if (typeof item === 'string') {
        return item;
      } if (Array.isArray(item)) {
        return formatClass(...item);
      } if ((typeof item === 'object') && (item.constructor === Object)) {
        return Object.entries(item)
          .filter(([key, value]) => (key && value))
          .map(([key, _value]) => key);
      }

      return [];
    })
    .join(' ');
}


export function mergeRecords<K extends string | number | symbol, V>(base: Record<K, V>, update: Record<K, V | undefined>): Record<K, V> {
  let newValue = { ...base, ...update };

  return Object.fromEntries(
    Object.entries(newValue).filter(([_key, value]) => value !== undefined)
  ) as Record<K, V>;
}


export function toggleSet<T>(set: ImSet<T>, item: T): ImSet<T> {
  if (set.has(item)) {
    return set.delete(item);
  } else {
    return set.add(item);
  }
}


export async function wrapAbortable<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (err) {
    if ((err as { name: string; }).name === 'AbortError') {
      return null;
    }

    throw err;
  }
}


export namespace renumber {
  type Operator = (seq: Seq, index: number) => Seq;
  type Seq = [number, number];

  export function deleteItems(items: number[]): Operator {
    let itemIndex = 0;
    let delta = 0;

    return (seq: Seq, _parentIndex: number) => {
      let delta0 = delta;

      for (; (seq[0] <= items[itemIndex])
        && (seq[1] > items[itemIndex])
        && (itemIndex < items.length); itemIndex += 1) {
        delta += 1;
      }

      return [seq[0] - delta0, seq[1] - delta];
    };
  }

  export function deleteParent(deletedParentIndex: number, deletedParentSeq: Seq): Operator {
    let deletedItemCount = deletedParentSeq[1] - deletedParentSeq[0];

    return (seq: Seq, parentIndex: number) => {
      return parentIndex >= deletedParentIndex
        ? [seq[0] - deletedItemCount, seq[1] - deletedItemCount]
        : seq;
    };
  }

  // export function deleteRange(a: number, b: number): Operator {
  //   return deleteItems(Range(a, b).toArray());
  // }


  export function deleteItem<K extends string, T extends Record<K, Seq>>(list: List<T>, seqKey: K, targetIndex: number): List<T> {
    let target = list.get(targetIndex)!;
    let deletedChildrenCount = target[seqKey][1] - target[seqKey][0];

    return list
      .delete(targetIndex)
      .map((item, itemIndex) => ({
        ...item,
        [seqKey]: itemIndex >= targetIndex
          ? [item[seqKey][0] - deletedChildrenCount, item[seqKey][1] - deletedChildrenCount]
          : item[seqKey]
      }));

    // return deleteRange(list, seqKey, targetIndex, targetIndex + 1);
  }

  export function deleteRange<K extends string, T extends Record<K, Seq>>(list: List<T>, seqKey: K, start: number, end: number, deletedChildrenCount: number = 1 /* ... */): List<T> {
    // let deletedChildrenCount = list.get(end - 1)![seqKey][1] - (list.get(start)?.[seqKey][0] ?? );

    return list
      .slice(0, start)
      .concat(list.slice(end).map((item) => ({
        ...item,
        [seqKey]: [item[seqKey][0] - deletedChildrenCount, item[seqKey][1] - deletedChildrenCount]
      })));
  }

  export function deleteChildItem<K extends string, T extends Record<K, Seq>>(list: List<T>, seqKey: K, targetIndex: number): List<T> {
    return list.map((item) => {
      let itemSeq = item[seqKey];

      return {
        ...item,
        [seqKey]: [
          itemSeq[0] + (targetIndex < itemSeq[0] ? -1 : 0),
          itemSeq[1] + (targetIndex < itemSeq[1] ? -1 : 0)
        ]
      };
    });
  }

  export function deleteChildItems<K extends string, T extends Record<K, Seq>>(list: List<T>, seqKey: K, unsortedTargetIndices: Iterable<number>): List<T> {
    let targetIndices = Array.from(unsortedTargetIndices).sort((a, b) => a - b);
    let targetIndicesIndex = 0;

    let delta = 0;

    return list.map((item) => {
      let itemSeq = item[seqKey];
      let start = itemSeq[0] - delta;

      for (; (targetIndices[targetIndicesIndex] < itemSeq[1]) && (targetIndicesIndex < targetIndices.length); targetIndicesIndex += 1) {
        delta += 1;
      }

      return {
        ...item,
        [seqKey]: [
          start,
          itemSeq[1] - delta
        ]
      }
    });
  }

  export function createChildItem<K extends string, T extends Record<K, Seq>>(list: List<T>, seqKey: K, targetIndex: number): List<T> {
    return list.map((item, itemIndex) => ({
      ...item,
      [seqKey]: [
        item[seqKey][0] + (itemIndex > targetIndex ? 1 : 0),
        item[seqKey][1] + (itemIndex >= targetIndex ? 1 : 0)
      ]
    }));
  }

  export function moveChildItems<K extends string, T extends Record<K, Seq>>(list: List<T>, seqKey: K, unsortedTargetIndices: Iterable<number>, itemInsertionIndex: number, childInsertionIndex: number): [List<T>, number] {
    let targetIndices = Array.from(unsortedTargetIndices).sort((a, b) => a - b);
    let targetIndicesIndex = 0;

    let delta = 0;
    let insertionIndex!: number;

    let newList = list.map((item, itemIndex) => {
      let itemSeq = item[seqKey];
      let start = itemSeq[0] - delta;

      for (; (targetIndices[targetIndicesIndex] < Math.min(itemSeq[1], childInsertionIndex)) && (targetIndicesIndex < targetIndices.length); targetIndicesIndex += 1) {
        delta += 1;
      }

      if (itemIndex === itemInsertionIndex) {
        insertionIndex = childInsertionIndex - delta;
        delta -= targetIndices.length;
      }

      for (; (targetIndices[targetIndicesIndex] < itemSeq[1]) && (targetIndicesIndex < targetIndices.length); targetIndicesIndex += 1) {
        delta += 1;
      }

      return {
        ...item,
        [seqKey]: [
          start,
          itemSeq[1] - delta
        ]
      };
    });

    return [newList, insertionIndex];
  }
}


export function debounce(delay: number, callback: () => void, options?: { signal?: AbortSignal; }): {
  (): void;
  cancel(): void;
  isActive(): boolean;
} {
  let timeout: number | null = null;

  options?.signal?.addEventListener('abort', () => {
    fn.cancel();
  });

  let fn = Object.assign(() => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      timeout = null;
      callback();
    }, delay);
  }, {
    cancel() {
      if (timeout !== null) {
        clearTimeout(timeout);
        timeout = null;
      }
    },
    isActive() {
      return (timeout !== null);
    }
  });

  return fn;
}


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


export class Pool {
  #promises = new Set<Promise<unknown>>();

  add<T>(func: (() => Promise<T>) | Promise<T>): Promise<T> {
    let promise = typeof func === 'function'
      ? func()
      : func;

    this.#promises.add(promise);

    promise
      .catch((err) => {
        console.error('Pool error');
        console.error(err);
      })
      .finally(() => {
        this.#promises.delete(promise);
      });

    return promise;
  }

  async wait() {
    while (this.#promises.size > 0) {
      await Promise.all(this.#promises);
    }
  }
}

export function usePool() {
  let ref = useRef<Pool>();
  ref.current ??= new Pool();
  return ref.current;
}


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

  async acquireWith(fn: (() => Promise<void> | void)) {
    let controller = new AbortController();

    await this.acquire();

    try {
      await fn();
    } finally {
      controller.abort();
    }
  }

  get locked() {
    return this.#locked;
  }
}


export function joinReactNodes(nodes: ReactNode[], glue: ReactNode) {
  return nodes.flatMap((node, index) => (index === 0) ? [node] : [glue, node]);
}
