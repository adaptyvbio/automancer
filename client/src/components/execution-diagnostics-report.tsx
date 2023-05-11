import * as React from 'react';

import { MasterAnalysis, MasterError } from '../interfaces/protocol';
import { DiagnosticsReport } from './diagnostics-report';


export function ExecutionDiagnosticsReport(props: {
  analysis: MasterAnalysis;
}) {
  // TODO: Sort by time

  let processDiagnostics = (diagnostics: MasterError[], kind: 'error' | 'warning') => {
    return diagnostics.slice().reverse().map((diagnostic, index) => ({
      id: diagnostic.id ?? index,
      kind,
      message: diagnostic.message,
      ranges: []
    }));
  };

  return (
    <DiagnosticsReport analysis={props.analysis} />
  );
}
