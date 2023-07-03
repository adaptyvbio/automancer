import { AnyDiagnostic, CompilationAnalysis, Effect, GenericEffect, MasterAnalysis, createReport } from 'pr1-shared';

import styles from '../../styles/components/diagnostics-report.module.scss';

import { formatRichText } from '../rich-text';
import { Icon } from './icon';


export function Report(props: {
  analysis: CompilationAnalysis | MasterAnalysis;
}) {
  if ((props.analysis.errors.length + props.analysis.warnings.length + (('effects' in props.analysis) ? props.analysis.effects.length : 0)) < 1) {
    return null;
  }

  return (
    <div className={styles.root}>
      {createReport(props.analysis).map(([entry, kind], index) => (
        kind !== 'effect'
          ? <ReportDiagnostic key={entry.id ?? -index - 1} diagnostic={entry} kind={kind} />
          : <ReportEffect key={-index - 1} effect={entry} />
      ))}
    </div>
  );
}


export function ReportDiagnostic(props: {
  diagnostic: AnyDiagnostic;
  kind: 'error' | 'warning';
}) {
  return (
    <div className={styles.entryRoot} data-kind={props.kind}>
      <Icon name={{ error: 'report', warning: 'warning' }[props.kind]} className={styles.entryIcon} />
      <div className={styles.entryTitle}>{props.diagnostic.message}</div>
      {/* <button type="button" className={styles.entryLocation}>5 minutes ago</button> */}
      {props.diagnostic.description && (
        <p className={styles.entryDescription}>{formatRichText(props.diagnostic.description)}</p>
      )}
      {/* <p className={styles.entryDescription}>This line contains a syntax error. See the documentation for details.</p> */}
      {/* TODO: Transform to dropdown */}
      {/* <div className={styles.entryActions}>
        <button type="button" className={styles.entryAction}>
          <Icon name="open_in_new" />
          Open
        </button>
        <button type="button" className={styles.entryAction}>
          <Icon name="delete" />
          Delete
        </button>
        <button type="button" className={styles.entryAction}>Open</button>
        <button type="button" className={styles.entryAction}>Delete</button>
      </div> */}
    </div>
  );
}


const DEFAULT_EFFECT_ICON = 'auto_awesome'; // 'flag'

export function ReportEffect(props: {
  effect: Effect;
}) {
  let effectInfo = (() => {
    switch (props.effect.type) {
      case 'generic': {
        let effect = props.effect as GenericEffect;

        return {
          description: effect.description,
          icon: (effect.icon ?? DEFAULT_EFFECT_ICON),
          message: effect.message
        };
      }

      default:
        return {
          description: null,
          icon: DEFAULT_EFFECT_ICON,
          message: 'Unknown effect'
        };
    }
  })();

  return (
    <div className={styles.entryRoot} data-kind="effect">
      <Icon name={effectInfo.icon} className={styles.entryIcon} />
      <div className={styles.entryTitle}>{effectInfo.message}</div>
      <button type="button" className={styles.entryLocation}>12 minutes ago</button>
      {effectInfo.description && (
        <p className={styles.entryDescription}>{formatRichText(effectInfo.description)}</p>
      )}
    </div>
  );
}
