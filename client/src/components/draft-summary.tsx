import * as React from 'react';

import { Icon } from '../components/icon';
import * as util from '../util';

import diagnosticsStyles from '../../styles/components/diagnostics.module.scss';


export function DraftSummary(props: {
  description?: string | null;
  onStart?(): void;
  status: 'default' | 'error' | 'success' | 'warning';
  title: string;
}) {
  return (
    <div className={util.formatClass(diagnosticsStyles.reportRoot, {
      default: {},
      error: diagnosticsStyles.reportRootError,
      success: diagnosticsStyles.reportRootSuccess,
      warning: diagnosticsStyles.reportRootWarning
    }[props.status])}>
      <Icon name={{
        default: 'pending',
        error: 'report',
        success: 'new_releases',
        warning: 'warning'
      }[props.status]} className={diagnosticsStyles.reportIcon} />
      <div className={diagnosticsStyles.reportTitle}>{props.title}</div>
      {props.description && <p className={diagnosticsStyles.reportDescription}>{props.description}</p>}
      {props.onStart && (
        <button type="button" className={diagnosticsStyles.reportActionRoot}>
          <Icon name="play_circle" className={diagnosticsStyles.reportActionIcon} />
          <div className={diagnosticsStyles.reportActionLabel} onClick={props.onStart}>Start</div>
        </button>
      )}
    </div>
  );
}
