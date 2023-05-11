import { List, Map as ImMap, Set as ImSet } from 'immutable';


export function serialize(input: unknown): unknown {
  if (Array.isArray(input)) {
    return ["Array", input.map((item) => serialize(item))];
  }

  if (input instanceof Map) {
    return ["Map", Array.from(input).map(([key, value]) => [
      serialize(key),
      serialize(value)
    ])];
  }

  if (input instanceof Set) {
    return ["Set", Array.from(input).map((item) => serialize(item))];
  }

  if (List.isList(input)) {
    return ["List", input.toArray().map((item) => serialize(item))];
  }

  if (ImMap.isMap(input)) {
    return ["ImMap", input.toArray().map(([key, value]) => [
      serialize(key),
      serialize(value)
    ])];
  }

  if (ImSet.isSet(input)) {
    return ["ImSet", input.toArray().map((item) => serialize(item))];
  }

  return input;
}


export function deserialize(input: unknown): unknown {
  if (Array.isArray(input)) {
    let [type, value] = input as [string, any];

    switch (type) {
      case 'Array':
        return (value as any[]).map((item) => deserialize(item));
      case 'Map':
        return new Map((value as [any, any][]).map(([key, value]) => [
          deserialize(key),
          deserialize(value)
        ]));
      case 'Set':
        return new Set((value as any[]).map((item) => deserialize(item)));

      case 'ImMap':
        return ImMap((value as [any, any][]).map(([key, value]) => [
          deserialize(key),
          deserialize(value)
        ]));
      case 'ImSet':
        return ImSet((value as any[]).map((item) => deserialize(item)));
      case 'List':
        return List((value as any[]).map((item) => deserialize(item)));

      default:
        throw new Error(`Unknown object type '${type}'`);
    }
  }

  return input;
}
