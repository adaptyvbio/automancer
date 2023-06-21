import { ComponentType } from 'react';

import type { Application } from '../application';
import type { Host } from '../host';


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

export type ViewType = ComponentType<ViewProps> & {
  hash?(options: ViewHashOptions): string;
  routes: ViewRouteDef[];
}

export interface ViewRouteDef {
  id: string;
  pattern: string;
}

export interface ViewRouteMatch {
  id: string;
  params: {};
  state: unknown;
}

export interface ViewRouteMatchDefault {
  id: any;
  params: any;
  state: any;
}
