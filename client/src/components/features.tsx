import * as React from 'react';

import { Icon } from './icon';
import { FeatureGroupDef, FeatureListDef } from '../interfaces/unit';
import * as util from '../util';

import styles from '../../styles/components/features.module.scss';


export function SimpleFeatureList(props: {
  list: FeatureListDef;
}) {
  return (
    <div className={util.formatClass(styles.list, styles.listSimple)}>
      {props.list.reverse().map((group, index) => (
        <FeatureGroup group={group} key={index} />
      ))}
    </div>
  );
}

export function FeatureList(props: {
  hoveredGroupIndex: number | null;
  list: FeatureListDef;
  pausedGroupIndex: number | null;
  setHoveredGroupIndex(value: number | null): void;
}) {
  return (
    <div className={styles.list}>
      <FeatureListDivider
        freezable={true}
        hovered={props.hoveredGroupIndex === props.list.length}
        paused={props.pausedGroupIndex === props.list.length}
        setHovered={(hovered) => void props.setHoveredGroupIndex(hovered ? props.list.length : null)} />
      {Array.from(props.list.entries()).reverse().map(([index, group]) => (
        <React.Fragment key={index}>
          <FeatureGroup group={group} />
          <FeatureListDivider
            hovered={props.hoveredGroupIndex === index}
            paused={props.pausedGroupIndex === index}
            setHovered={(hovered) => void props.setHoveredGroupIndex(hovered ? index : null)} />
        </React.Fragment>
      ))}
    </div>
  );
}


export function FeatureListDivider(props: {
  freezable?: unknown;
  hovered: unknown;
  paused: unknown;
  setHovered(value: boolean): void;
}) {
  return (
    <button
      type="button"
      className={util.formatClass(styles.dividerRoot, {
        '_active': props.paused,
        '_alternate': (props.paused && !props.hovered)
      })}
      onMouseEnter={() => void props.setHovered(true)}
      onMouseLeave={() => void props.setHovered(false)}>
      <div />
      <div className={styles.dividerLabel}>
        {props.paused
          ? (props.hovered ? 'Resume' : (props.freezable ? 'Frozen' : 'Paused'))
          : (props.freezable ? 'Freeze' : 'Pause')}
      </div>
      <div />
    </button>
  );
}


export function FeatureGroup(props: {
  group: FeatureGroupDef;
}) {
  return (
    <div className={styles.group}>
      {(props.group.length > 0)
        ? props.group.map((feature) => (
          <div className={util.formatClass(styles.entry, {
            [styles.entryAccent]: feature.accent,
            [styles.entryDisabled]: feature.disabled
          })} key={feature.label}>
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
          </div>
        ))
        : (
          <div className={styles.blankOuter}>
            <div className={styles.blankInner}>No change</div>
          </div>
        )}
    </div>
  );
}
