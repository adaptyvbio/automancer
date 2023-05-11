import { UnitNamespace } from 'pr1-shared';
import * as React from 'react';

import viewStyles from '../../styles/components/view.module.scss';

import { ViewChips } from './chips';
import { ViewProps } from '../interfaces/view';


export function ViewUnitTab(props: ViewProps) {
  let unit = props.host.units[props.route.params.namespace as UnitNamespace];
  let tab = unit?.generalTabs?.find((tab) => (tab.id === props.route.params.id));

  React.useEffect(() => {
    if (!tab) {
      ViewChips.navigate();
    }
  }, []);

  if (!tab) {
    return null;
  }

  let Component = tab.component;

  return (
    <main className={viewStyles.root}>
      <Component
        app={props.app}
        host={props.host} />
    </main>
  );
}


ViewUnitTab.routes = [
  { id: '_', pattern: `/unit/:namespace/:id` }
];
