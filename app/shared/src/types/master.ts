import type { CompilationAnalysis } from './compilation';
import type { Diagnostic } from './diagnostic';
import type { Protocol, Term } from './protocol';


export type MasterBlockId = number;

export interface MasterBlockLocation {
  children: Record<MasterBlockId, MasterBlockLocation>;
  childrenTerms: Record<MasterBlockId, Term>;
  startDate: number;
  term: Term;
}


export interface Master {
  initialAnalysis: CompilationAnalysis;
  location: MasterBlockLocation;
  masterAnalysis: MasterAnalysis;
  protocol: Protocol;
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
