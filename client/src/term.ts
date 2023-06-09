import type { Term } from 'pr1-shared';


export function getDateFromTerm(term: Term, refDate: number) {
  switch (term.type) {
    case 'datetime':
      return term.value;
    case 'duration':
      return refDate + term.value;
    default:
      return null;
  }
}
