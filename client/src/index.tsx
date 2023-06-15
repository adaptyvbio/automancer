/// <reference path="global-interfaces.d.ts" />
/// <reference path="types.d.ts" />

import 'material-symbols/rounded.css';
import 'material-symbols/sharp.css';

import * as React_ from 'react';
import * as ReactDOM_ from 'react-dom/client';
import { createRoot } from 'react-dom/client';

import { BrowserApp } from './browser-app';

import '../styles/main.scss';


export { Application } from './application';
export * from './app-backends/base';
export * from './app-backends/browser';
export * from './backends/common';
export * from './contexts';
export * from './draft';
export * from './format';
export * from './host';
export * from './process';
export { Startup } from './startup';
export * from './components/icon';
export * as Form from './components/standard-form';
export { Pool } from './util';
export * as util from './util';

/** @deprecated */
export const React = React_;

/** @deprecated */
export const ReactDOM = ReactDOM_;

export * from './components/button';
export * from './components/context-menu';
export * from './components/description';
export * from './components/diagnostics-report';
export * from './components/error-boundary';
export * from './components/expandable-text';
export * from './components/features';
export * from './components/graph-editor';
export * from './components/item-list';
export * from './components/large-icon';
export * from './components/progress-bar';
export * from './components/selector';
export * from './components/shadow-scrollable';
export * from './components/static-select';
export * from './components/time-sensitive';
export * from './components/timed-progress-bar';
export * from './components/title-bar';
export * from './dynamic-value';
export * from './geometry';
export * from './libraries/panel';
export * from './store/application';
export * from './store/base';
export * from './store/browser-storage';
export * from './store/idb';
export * from './store/store-manager';
export * from './unit';
export * from './ureg';

export * from './interfaces/graph';
export * from './interfaces/host';
export * from './interfaces/plugin';
export * from './interfaces/protocol';
export * from './interfaces/view';


export function createBrowserApp(element: Element) {
  let root = createRoot(element);
  root.render(<BrowserApp />);
}
