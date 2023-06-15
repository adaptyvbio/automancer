import type { CompilationAnalysis } from './compilation';
import type { Diagnostic } from './diagnostic';
import type { Protocol, Term } from './protocol';
import type { Brand } from './util';


export type MasterId = Brand<string, 'MasterId'>;

export type MasterBlockId = number;

export interface MasterBlockLocation {
  children: Record<MasterBlockId, MasterBlockLocation>;
  childrenTerms: Record<MasterBlockId, Term>;
  startDate: number;
  term: Term;
}


export interface Master {
  id: MasterId;
  initialAnalysis: CompilationAnalysis;
  location: MasterBlockLocation;
  masterAnalysis: MasterAnalysis;
  protocol: Protocol;
  startDate: number;
}

export interface MasterAnalysis {
  errors: MasterDiagnosticItem<Diagnostic>[];
  warnings: MasterDiagnosticItem<Diagnostic>[];
}

export interface MasterDiagnosticItem<T> {
  authorPath: number[];
  eventIndex: number;
  value: T;
}
