import type { Diagnostic } from './diagnostic';


export interface CompilationAnalysis {
  errors: Diagnostic[];
  warnings: Diagnostic[];
}
