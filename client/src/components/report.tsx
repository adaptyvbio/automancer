import { AnyDiagnostic, CompilationAnalysis, Diagnostic, MasterAnalysis, createReport } from 'pr1-shared';

import styles from '../../styles/components/diagnostics-report.module.scss';

import { Icon } from './icon';
import { assert, formatClass } from '../util';


export function Report(props: {
  analysis: CompilationAnalysis | MasterAnalysis;
}) {
  if ((props.analysis.errors.length + props.analysis.warnings.length) < 1) {
    return null;
  }

  return (
    <div className={styles.root}>
      {createReport(props.analysis).map(([diagnostic, kind], index) => (
        <DiagnosticsReportEntry key={diagnostic.id ?? -index} diagnostic={diagnostic} kind={kind} />
      ))}
    </div>
  );
}


export function DiagnosticsReportEntry(props: {
  diagnostic: AnyDiagnostic;
  kind: 'error' | 'warning';
}) {
  return (
    <div className={formatClass(styles.entryRoot, {
      error: styles.entryRootError,
      warning: styles.entryRootWarning
    }[props.kind])}>
      <Icon name={{ error: 'report', warning: 'warning' }[props.kind]} className={styles.entryIcon} />
      <div className={styles.entryTitle}>{props.diagnostic.message}</div>
      <button type="button" className={styles.entryLocation}>foo.yml 13:8</button>
      <p className={styles.entryDescription}>This line contains a syntax error. See the documentation for details.</p>
    </div>
  );
}
