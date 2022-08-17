/// <reference path="global-interfaces.d.ts" />

import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { createRoot } from 'react-dom/client';

import { BrowserApp } from './browser-app';

import '../lib/styles/index.css';
import 'material-symbols';

export { Application } from './application';
export * from './backends/common';
export { MessageBackend } from './backends/message';
export * from './host';
export { Startup } from './startup';
export * as Form from './components/standard-form';
export * from './units';
export { Pool } from './util';
export * as util from './util';
export { React, ReactDOM };


export function createBrowserApp(element: Element) {
  let root = createRoot(element);
  root.render(<BrowserApp />);
}
