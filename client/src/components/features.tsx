import * as React from 'react';

import { Icon } from './icon';
import { FeatureGroupDef, FeatureListDef } from '../interfaces/unit';
import * as util from '../util';

import spotlightStyles from '../../styles/components/spotlight.module.scss';


export function FeatureList(props: {
  list: FeatureListDef;
}) {
  return (
    <div className={spotlightStyles.featureList}>
      {props.list.map((group, index) => (
        <FeatureGroup group={group} key={index} />
      ))}
    </div>
  );
}


export function FeatureGroup(props: {
  group: FeatureGroupDef;
}) {
  return (
    <div className={spotlightStyles.featureGroup}>
      {(props.group.length > 0)
        ? props.group.map((feature) => (
          <div className={util.formatClass(spotlightStyles.featureEntry, {
            [spotlightStyles.featureEntryAccent]: feature.accent,
            [spotlightStyles.featureEntryDisabled]: feature.disabled
          })} key={feature.label}>
            <Icon name={feature.icon} className={spotlightStyles.featureIcon} />
            {feature.description && <div className={spotlightStyles.featureDescription}>{feature.description}</div>}
            <div className={spotlightStyles.featureLabel}>{feature.label}</div>
          </div>
        ))
        : (
          <div className={spotlightStyles.featureBlank}>No change</div>
        )}
    </div>
  );
}
