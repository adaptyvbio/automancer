import viewStyles from '../../styles/components/view.module.scss';

import { ViewExperiments } from './experiments';
import { ViewProps } from '../interfaces/view';
import { PluginName } from 'pr1-shared';
import { useEffect } from 'react';
import { createPluginContext } from '../plugin';


export function ViewPluginView(props: ViewProps) {
  let namespace = (props.route.params.namespace as PluginName);
  let plugin = props.host.plugins[namespace];
  let viewEntry = plugin?.views?.find((viewEntry) => (viewEntry.id === props.route.params.id));

  useEffect(() => {
    if (!viewEntry) {
      ViewExperiments.navigate();
    }
  }, []);

  if (!viewEntry) {
    return null;
  }

  let Component = viewEntry.Component;

  return (
    <main className={viewStyles.root}>
      <Component
        context={createPluginContext(props.app, props.host, namespace)} />
    </main>
  );
}


ViewPluginView.routes = [
  { id: '_', pattern: `/unit/:namespace/:id` }
];
