import * as React from 'react';

import { Application } from '../application';
import { Host } from '../host';


// Returns true => we can continue navigation
export type UnsavedDataCallback<T extends ViewRouteMatch = ViewRouteMatchDefault> = (newRoute: T | null) => Promise<boolean> | boolean;

export interface ViewProps<T extends ViewRouteMatch = ViewRouteMatchDefault> {
  app: Application;
  host: Host;

  route: T;
  setUnsavedDataCallback(callback: UnsavedDataCallback<T> | null): void;
}

export interface ViewHashOptions<T extends ViewRouteMatch = ViewRouteMatchDefault> {
  app: Application;
  host: Host;
  route: T;
}

export type ViewType = React.ComponentType<ViewProps> & {
  hash?(options: ViewHashOptions): string;
  routes: ViewRoute[];
}

export interface ViewRoute {
  id: string;
  pattern: string;
}

export interface ViewRouteMatch {
  id: string;
  params: {};
}

export interface ViewRouteMatchDefault extends ViewRouteMatch {
  id: any;
  params: any;
}
