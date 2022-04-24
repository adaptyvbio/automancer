import type { Set as ImSet } from 'immutable';


export function findLastEntry<T>(arr: T[], fn: (item: T, index: number, arr: T[]) => unknown): [number, T] | undefined {
  for (let index = arr.length - 1; index >= 0; index -= 1) {
    if (fn(arr[index], index, arr)) {
      return [index, arr[index]];
    }
  }

  return undefined;
}


export function formatClass(...input: (string | Record<string, unknown>)[]): string {
  return input
    .flatMap((item) => {
      if (typeof item === 'string') {
        return item;
      } if (Array.isArray(item)) {
        return formatClass(...item);
      } if (item.constructor === Object) {
        return Object.entries(item)
          .filter(([_key, value]) => value)
          .map(([key, _value]) => key);
      }

      return [];
    })
    .join(' ');
}


export function toggleSet<T>(set: ImSet<T>, item: T): ImSet<T> {
  if (set.has(item)) {
    return set.delete(item);
  } else {
    return set.add(item);
  }
}
