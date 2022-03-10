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
