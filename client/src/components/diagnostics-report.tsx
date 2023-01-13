import * as React from 'react';

import styles from '../../styles/components/diagnostics-report.module.scss';

import * as util from '../util';
import { DraftDiagnostic } from '../draft';
import { Icon } from './icon';


export function DiagnosticsReport(props: {
  diagnostics: DraftDiagnostic[];
}) {
  return (
    <div className={styles.root}>
      {props.diagnostics.map((diagnostic, index) => (
        <div className={util.formatClass(styles.entryRoot, {
          error: styles.entryRootError,
          warning: styles.entryRootWarning
        }[diagnostic.kind])} key={index}>
          <Icon name={{ error: 'report', warning: 'warning' }[diagnostic.kind]} className={styles.entryIcon} />
          <div className={styles.entryTitle}>{diagnostic.message}</div>
          <button type="button" className={styles.entryLocation}>foo.yml 13:8</button>
          <p className={styles.entryDescription}>This line contains a syntax error. See the documentation for details.</p>
        </div>
      ))}
    </div>
  );
}
