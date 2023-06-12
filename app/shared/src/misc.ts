import type { Diagnostic } from './types/diagnostic';


export function concatenateDiagnostics(analysis: {
  errors: Diagnostic[];
  warnings: Diagnostic[];
} | null) {
  return [
    ...(analysis?.errors ?? []).map((diagnostic) => [diagnostic, 'error'] as const),
    ...(analysis?.warnings ?? []).map((diagnostic) => [diagnostic, 'warning'] as const)
  ];
}
