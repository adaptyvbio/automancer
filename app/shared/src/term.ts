import type { AnyDurationTerm, DurationTerm, Term } from './types/protocol';


export function addTerms(target: AnyDurationTerm, other: AnyDurationTerm): AnyDurationTerm;
export function addTerms(target: Term, other: Term): Term;

export function addTerms(target: Term, other: Term): Term {
  if ((target.type === 'forever') || (other.type === 'forever')) {
    return { type: 'forever' };
  }

  if ((target.type === 'unknown') || (other.type === 'unknown')) {
    return { type: 'unknown' };
  }

  if ((target.type === 'duration') && (other.type === 'duration')) {
    return {
      type: 'duration',
      resolution: (target.resolution + other.resolution),
      value: (target.value + other.value)
    };
  }

  throw new Error('Invalid operation');
}


export function createZeroTerm(): DurationTerm {
  return {
    type: 'duration',
    resolution: 0,
    value: 0
  };
}
