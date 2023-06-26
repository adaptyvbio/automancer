import type { CompilationAnalysis } from './types/compilation';
import type { MasterAnalysis } from './types/master';


export function createReport(analysis: CompilationAnalysis | MasterAnalysis | null) {
  return [
    ...(analysis && ('effects' in analysis) ? analysis.effects : []).map((effect) => [effect, 'effect'] as const),
    ...(analysis?.errors ?? []).map((diagnostic) => [diagnostic, 'error'] as const),
    ...(analysis?.warnings ?? []).map((diagnostic) => [diagnostic, 'warning'] as const)
  ];
}
