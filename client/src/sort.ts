import seqOrd from 'seq-ord';

import { Unit } from './units';


export const sortUnits = seqOrd<Unit<unknown, unknown>>(function* (a, b, rules) {
  if (a.namespace !== b.namespace) {
    if (a.namespace === 'metadata') {
      yield -1;
    }

    if (b.namespace === 'metadata') {
      yield 1;
    }
  }
});
