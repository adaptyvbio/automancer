import { DiagnosticsReport } from './diagnostics-report';
import { ExperimentReportInfo, Master, MasterAnalysis } from 'pr1-shared';


export function ExecutionDiagnosticsReport(props: {
  master: ExperimentReportInfo | Master;
}) {
  // TODO: Sort by time

  // let processDiagnostics = (diagnostics: Diagnostic[], kind: 'error' | 'warning') => {
  //   return diagnostics.slice().reverse().map((diagnostic, index) => ({
  //     id: diagnostic.id ?? index,
  //     kind,
  //     message: diagnostic.message,
  //     ranges: []
  //   }));
  // };

  let initial = props.master.initialAnalysis;
  let master = props.master.masterAnalysis;

  return (
    <DiagnosticsReport analysis={{
      errors: [...initial.errors, ...master.errors.map((error) => error.value)],
      warnings: [...initial.warnings, ...master.warnings.map((warning) => warning.value)]
    }} />
  );
}
