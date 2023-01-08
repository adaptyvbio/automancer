import React from 'react';

import { Application } from '../application';
import { Host } from '../host';


export interface ViewProps {
  app: Application;
  host: Host;
}

export interface ViewType {
  new(props: ViewProps): React.Component<ViewProps, unknown>;

  route: ViewRoute;
}

export interface ViewRoute {
  id: string;
  pattern: string;
}
