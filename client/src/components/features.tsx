import * as React from 'react';

import { Icon } from './icon';

import spotlightStyles from '../../styles/components/spotlight.module.scss';
import { FeatureGroupDef, FeatureListDef } from '../interfaces/unit';


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
      {props.group.map((feature) => (
        <div className={spotlightStyles.featureEntry} key={feature.label}>
          <Icon name={feature.icon} className={spotlightStyles.featureIcon} />
          {feature.description && <div className={spotlightStyles.featureDescription}>{feature.description}</div>}
          <div className={spotlightStyles.featureLabel}>{feature.label}</div>
        </div>
      ))}
    </div>
  );
}
