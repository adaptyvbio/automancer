import { ReactNode } from 'react';

import styles from '../../styles/components/diagnostics-summary.module.scss';

import { Icon } from '../components/icon';
import { formatClass } from '../util';
import { ShortcutGuide } from './shortcut-guide';


export function DraftSummary(props: {
  description?: ReactNode | null;
  message: ReactNode | null;
  onTrigger?: (() => void) | null;
  status: 'default' | 'error' | 'success' | 'warning';
  title: ReactNode;
}) {
  return (
    <div className={formatClass(styles.root, {
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
      {props.onTrigger && (
        <button type="button" className={styles.actionRoot} onClick={props.onTrigger}>
          <Icon name="play_circle" className={styles.actionIcon} />
          <div className={styles.actionLabel}>
            <ShortcutGuide shortcut="Meta+Shift+S">{props.message}</ShortcutGuide>
          </div>
        </button>
      )}
    </div>
  );
}
