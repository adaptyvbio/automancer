import { OrdinaryId } from 'pr1-shared';
import { PropsWithChildren, ReactNode, memo, useState } from 'react';

import styles from '../../styles/components/features.module.scss';

import { formatClass } from '../util';
import { Icon } from './icon';



export interface FeatureDef {
  id?: OrdinaryId;
  accent?: unknown;
  actions?: FeatureActionDef[];
  description?: string | null;
  disabled?: unknown;
  error?: {
    kind: 'emergency' | 'error' | 'power' | 'shield' | 'warning';
    message: string;
  } | null;
  icon: string;
  label: ReactNode;
}

export interface FeatureActionDef {
  id: OrdinaryId;
  disabled?: unknown;
  icon: string;
  label?: string;
}


export const Feature = memo(({ feature, onAction }: {
  feature: FeatureDef;
  onAction?(actionId: OrdinaryId): void;
}) => {
  return (
    <div className={formatClass(styles.feature, { [styles.featureAccent]: feature.accent })}>
      <Icon name={feature.icon} className={styles.icon} />
      <div className={styles.body}>
        {feature.description && <div className={styles.description}>{feature.description}</div>}
        <div className={styles.label}>{feature.label}</div>
      </div>
      {feature.error && (
        <Icon
          className={styles.errorIcon}
          name={{
            emergency: 'emergency_home',
            error: 'error',
            power: 'power_off',
            shield: 'gpp_maybe',
            warning: 'warning'
          }[feature.error.kind]}
          title={feature.error.message} />
      )}
      {feature.actions?.map((action) => (
        <button
          type="button"
          disabled={!!action.disabled}
          title={action.label}
          className={styles.action}
          key={action.id}
          onClick={() => void onAction!(action.id)}>
          <Icon name={action.icon} style="sharp" />
        </button>
      ))}
    </div>
  );
});


export const FeatureEntry = memo((props: {
  actions?: FeatureActionDef[];
  detail?: (() => ReactNode) | null;
  features: FeatureDef[];
  onAction?(actionId: OrdinaryId): void;
}) => {
  let [detailOpen, setDetailOpen] = useState(false);

  return (
    <div className={styles.entry}>
      <div className={styles.features}>
        {props.features.map((feature, featureIndex) => (
          <Feature
            feature={{
              ...feature,
              actions: (featureIndex === 0)
                ? [
                  ...(props.actions ?? []),
                  ...(
                    props.detail
                      ? detailOpen
                        ? [{
                          id: '_toggle',
                          label: 'Collapse',
                          icon: 'expand_less'
                        }]
                        : [{
                          id: '_toggle',
                          label: 'Expand',
                          icon: 'expand_more'
                        }]
                      : []
                  )
                ]
                : []
            }}
            onAction={(actionId) => {
              if (actionId === '_toggle') {
                setDetailOpen((open) => !open);
              } else {
                props.onAction!(actionId);
              }
            }}
            key={feature.id ?? featureIndex} />
        ))}
      </div>
      {detailOpen && props.detail && (
        <div className={styles.detail}>
          {props.detail()}
        </div>
      )}
    </div>
  );
});


export function FeatureList(props: {
  features: FeatureDef[];
}) {
  return (
    <div className={styles.entry}>
      <div className={styles.features}>
        {props.features.map((feature, featureIndex) => (
          <Feature feature={feature} key={featureIndex} />
        ))}
      </div>
    </div>
  );
}


export function FeatureRoot(props: PropsWithChildren<{}>) {
  return (
    <div className={styles.root}>
      {props.children}
    </div>
  );
}
