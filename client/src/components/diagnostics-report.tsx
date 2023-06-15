import { concatenateDiagnostics } from 'pr1-shared';

import styles from '../../styles/components/diagnostics-report.module.scss';

import * as util from '../util';
import { Icon } from './icon';
import { PanelPlaceholder } from '../libraries/panel';


export function DiagnosticsReport(props: {
  analysis: any;
}) {
  if ((props.analysis.errors.length + props.analysis.warnings.length) < 1) {
    return (
      <PanelPlaceholder message="Nothing to report" />
    );
  }

  return (
    <div className={styles.root}>
      {concatenateDiagnostics(props.analysis).map(([diagnostic, kind], index) => (
        <div className={util.formatClass(styles.entryRoot, {
          error: styles.entryRootError,
          warning: styles.entryRootWarning
        }[kind])} key={index}>
          <Icon name={{ error: 'report', warning: 'warning' }[kind]} className={styles.entryIcon} />
          <div className={styles.entryTitle}>{diagnostic.message}</div>
          {/* <button type="button" className={styles.entryLocation}>foo.yml 13:8</button> */}
          {/* <p className={styles.entryDescription}>This line contains a syntax error. See the documentation for details.</p> */}
        </div>
      ))}
    </div>
  );
}
