import type { CompilationAnalysis } from './compilation';
import type { Diagnostic } from './diagnostic';
import { Effect } from './effect';
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
  effects: MasterEffect[];
  errors: MasterDiagnostic[];
  warnings: MasterDiagnostic[];
}

export type MasterItem<T> = Omit<T, 'runtimeInfo'> & {
  runtimeInfo: {
    authorPath: number[];
    eventIndex: number;
  };
}

export type MasterDiagnostic = MasterItem<Diagnostic>;
export type AnyDiagnostic = Diagnostic | MasterDiagnostic;

export type MasterEffect = MasterItem<Effect>;
export type AnyEffect = Effect | MasterEffect;
