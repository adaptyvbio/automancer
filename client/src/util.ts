import { List, Range, type Set as ImSet } from 'immutable';


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
          itemSeq[0] + (itemSeq[0] > targetIndex ? -1 : 0),
          itemSeq[1] + (itemSeq[1] > targetIndex ? -1 : 0)
        ]
      };
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
}
