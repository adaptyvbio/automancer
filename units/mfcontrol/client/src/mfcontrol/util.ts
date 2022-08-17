export function encodeIndices(arr: number[]): bigint {
  return arr.reduce((sum, item) => sum | (1n << BigInt(item)), 0n);
}
