import type { Protocol, Term } from './protocol';
import type { Brand } from './util';


export type MasterBlockId = number;

export interface MasterBlockLocation {
  children: Record<MasterBlockId, MasterBlockLocation>;
  childrenTerms: Record<MasterBlockId, Term>;
  startDate: number;
  term: Term;
}


export interface Master {
  analysis: MasterAnalysis;
  location: MasterBlockLocation;
  protocol: Protocol;
}

export interface MasterAnalysis {
  errors: any[];
  warnings: any[];
}
