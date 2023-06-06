import * as React from 'react';

import styles from '../../styles/components/diagnostics-summary.module.scss';

import { Icon } from '../components/icon';
import * as util from '../util';
import { ShortcutGuide } from './shortcut-guide';


export function DraftSummary(props: {
  description?: string | null;
  onStart?: (() => void) | null;
  status: 'default' | 'error' | 'success' | 'warning';
  title: string;
}) {
  return (
    <div className={util.formatClass(styles.root, {
      default: {},
      error: styles.rootError,
      success: styles.rootSuccess,
      warning: styles.rootWarning
    }[props.status])}>
      <Icon name={{
        default: 'pending',
        error: 'report',
        success: 'new_releases',
        warning: 'warning'
      }[props.status]} className={styles.icon} />
      <div className={styles.title}>{props.title}</div>
      {props.description && <p className={styles.description}>{props.description}</p>}
      {props.onStart && (
        <button type="button" className={styles.actionRoot} onClick={props.onStart}>
          <Icon name="play_circle" className={styles.actionIcon} />
          <div className={styles.actionLabel}>
            <ShortcutGuide shortcut="Meta+Shift+S">Start</ShortcutGuide>
          </div>
        </button>
      )}
    </div>
  );
}
