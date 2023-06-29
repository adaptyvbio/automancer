import { CompilationAnalysis, MasterAnalysis, createReport } from 'pr1-shared';

import styles from '../../styles/components/diagnostics-report.module.scss';

import { PanelPlaceholder } from '../libraries/panel';
import { Report } from './report';


export function ReportPanel(props: {
  compilationAnalysis: CompilationAnalysis | null;
  masterAnalysis?: MasterAnalysis;
}) {
  if (!props.compilationAnalysis || (
    props.compilationAnalysis.errors.length +
    props.compilationAnalysis.warnings.length +
    (props.masterAnalysis?.errors.length ?? 0) +
    (props.masterAnalysis?.warnings.length ?? 0) +
    (props.masterAnalysis?.effects.length ?? 0)
  ) < 1) {
    return (
      <PanelPlaceholder message="Nothing to report" />
    );
  }

  return (
    <div className={styles.panel}>
      <Report analysis={props.compilationAnalysis} />
      {props.masterAnalysis && <Report analysis={props.masterAnalysis} />}
    </div>
  );
}
