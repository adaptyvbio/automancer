import type { DiagnosticBaseReference } from './diagnostic';


export interface Effect {
  references: DiagnosticBaseReference[];
}

export interface GenericEffect {
  message: string;
}
